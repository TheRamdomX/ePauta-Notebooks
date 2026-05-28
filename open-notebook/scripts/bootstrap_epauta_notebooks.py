#!/usr/bin/env python3
"""
Bootstrap script: creates one Notebook in open-notebook per ramo in ePAUTA.

Reads the JSON course catalogs from the ePAUTA project (../epauta/src/data/)
and creates a corresponding Notebook for each course. Outputs a mapping file
(notebook_mapping.json) that ePAUTA consumes to route requests.

Usage:
    # Default — assumes sibling directory layout (../epauta/)
    python scripts/bootstrap_epauta_notebooks.py

    # Custom paths
    python scripts/bootstrap_epauta_notebooks.py \
        --epauta-data ../epauta/src/data \
        --api http://localhost:5055/api \
        --output scripts/notebook_mapping.json

Environment:
    OPEN_NOTEBOOK_API  — base URL of the open-notebook API (default: http://localhost:5055/api)
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import httpx

# Load .env.local if it exists
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API_BASE = os.environ.get("OPEN_NOTEBOOK_API", "http://localhost:5055/api")

# Map of carrera directory → human-readable programme name
PROGRAMAS = {
    "plan-comun": "Plan Común",
    "eit": "Informática y Telecomunicaciones",
    "eoc": "Obras Civiles",
    "eii": "Ingeniería Industrial",
}


def load_ramos(epauta_data: Path) -> list[dict]:
    """
    Load all ramos from ePAUTA JSON files.

    Returns a list of dicts with keys: codigo, nombre, programa, slug.
    The slug is built as ``<programa>/<codigo>`` (e.g. ``eit/CIT-1010``)
    which mirrors the R2 bucket prefix used by ePAUTA.
    """
    ramos: list[dict] = []

    for programa_dir, programa_name in PROGRAMAS.items():
        ramos_file = epauta_data / programa_dir / "ramos.json"
        if not ramos_file.exists():
            print(f"  [skip] {ramos_file} not found")
            continue

        with open(ramos_file, encoding="utf-8") as f:
            entries = json.load(f)

        for entry in entries:
            ramos.append(
                {
                    "codigo": entry["codigo"],
                    "nombre": entry["nombre"],
                    "programa": programa_dir,
                    "programa_nombre": programa_name,
                    "slug": f"{programa_dir}/{entry['codigo']}",
                }
            )

    return ramos


def bootstrap(
    epauta_data: Path,
    api_base: str,
    output_path: Path,
) -> None:
    ramos = load_ramos(epauta_data)
    if not ramos:
        print("No ramos found. Check --epauta-data path.")
        sys.exit(1)

    print(f"Found {len(ramos)} ramos across {len(PROGRAMAS)} programmes")
    print(f"API: {api_base}\n")

    created: dict[str, str] = {}
    errors = 0

    with httpx.Client(base_url=api_base, timeout=30) as client:
        # First, fetch existing notebooks to avoid duplicates
        try:
            resp = client.get("/notebooks")
            resp.raise_for_status()
            existing = {nb["name"]: nb["id"] for nb in resp.json()}
        except Exception as e:
            print(f"Warning: could not fetch existing notebooks: {e}")
            existing = {}

        for ramo in ramos:
            nb_name = f"[{ramo['codigo']}] {ramo['nombre']}"

            # Re-use existing notebook if name matches
            if nb_name in existing:
                created[ramo["slug"]] = existing[nb_name]
                print(f"  [exists] {nb_name} -> {existing[nb_name]}")
                continue

            try:
                resp = client.post(
                    "/notebooks",
                    json={
                        "name": nb_name,
                        "description": (
                            f"Ramo {ramo['nombre']} ({ramo['codigo']}) — "
                            f"Programa {ramo['programa_nombre']}"
                        ),
                    },
                )
                resp.raise_for_status()
                notebook = resp.json()
                nb_id = notebook.get("id") or str(notebook)
                created[ramo["slug"]] = nb_id
                print(f"  [created] {nb_name} -> {nb_id}")
            except Exception as e:
                print(f"  [error] {nb_name}: {e}")
                errors += 1

    # Write mapping
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(created, f, indent=2, ensure_ascii=False)

    print(f"\nDone: {len(created)} mapped, {errors} errors")
    print(f"Mapping written to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bootstrap ePAUTA notebooks")
    parser.add_argument(
        "--epauta-data",
        type=Path,
        default=Path(__file__).resolve().parent.parent.parent / "epauta" / "src" / "data",
        help="Path to ePAUTA src/data/ directory",
    )
    parser.add_argument(
        "--api",
        default=API_BASE,
        help="open-notebook API base URL",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "notebook_mapping.json",
        help="Output path for the mapping JSON",
    )
    args = parser.parse_args()
    bootstrap(args.epauta_data, args.api, args.output)
