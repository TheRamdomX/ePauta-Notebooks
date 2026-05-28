#!/usr/bin/env python3
"""
ingest_from_r2.py
Este script lee los archivos directamente de R2, deduce los ramos a partir de
la estructura de carpetas de R2 (<programa>/<codigo>/<archivo>),
crea un Notebook por cada ramo encontrado (cruzando los datos con los jsons de ePAUTA
para obtener nombres legibles), mapea esos IDs y luego ingesta los archivos como
Sources dentro del respectivo Notebook.

Uso:
    python scripts/ingest_from_r2.py

Variables de entorno requeridas:
    R2_ENDPOINT
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET_NAME
    R2_PUBLIC_DOMAIN
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import httpx

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API_BASE = os.environ.get("OPEN_NOTEBOOK_API", "http://localhost:5055/api")
R2_ENDPOINT = os.environ.get("R2_ENDPOINT")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "epauta")
R2_PUBLIC_DOMAIN = os.environ.get("R2_PUBLIC_DOMAIN")

PROGRAMAS_NAMES = {
    "plan-comun": "Plan Común",
    "eit": "Informática y Telecomunicaciones",
    "eoc": "Obras Civiles",
    "eii": "Ingeniería Industrial",
}

def load_ramos_metadata(epauta_data: Path) -> dict:
    ramos = {}
    for programa_dir, programa_name in PROGRAMAS_NAMES.items():
        ramos_file = epauta_data / programa_dir / "ramos.json"
        if not ramos_file.exists():
            continue
        with open(ramos_file, encoding="utf-8") as f:
            for entry in json.load(f):
                slug = f"{programa_dir}/{entry['codigo']}"
                ramos[slug] = {
                    "codigo": entry["codigo"],
                    "nombre": entry["nombre"],
                    "programa_nombre": programa_name
                }
    return ramos

def list_r2_keys() -> list[str]:
    try:
        import boto3
    except ImportError:
        print("boto3 es requerido: pip install boto3")
        sys.exit(1)

    if not all([R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY]):
        print("Error: R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY deben estar definidos")
        sys.exit(1)

    s3 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    )
    paginator = s3.get_paginator("list_objects_v2")
    keys = []
    print(f"Listando archivos del bucket R2 '{R2_BUCKET_NAME}'...")
    for page in paginator.paginate(Bucket=R2_BUCKET_NAME):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])
    return keys

def main(epauta_data: Path, output_map: Path):
    # 0. Cargar metadata local de ePAUTA (nombres bonitos para crear notebooks)
    ramos_meta = load_ramos_metadata(epauta_data)
    
    # 1. Obtener archivos de R2
    keys = list_r2_keys()
    if not keys:
        print("No se encontraron archivos en R2.")
        return
        
    # 2. Agrupar por slug (programa/codigo)
    archivos_por_ramo = {}
    for key in keys:
        parts = key.split("/")
        if len(parts) >= 3:
            slug = f"{parts[0]}/{parts[1]}"
            if slug not in archivos_por_ramo:
                archivos_por_ramo[slug] = []
            archivos_por_ramo[slug].append(key)
            
    print(f"Se encontraron archivos para {len(archivos_por_ramo)} ramos/slugs distintos.")

    notebook_mapping = {}

    with httpx.Client(base_url=API_BASE, timeout=60) as client:
        # Recuperar libretas ya existentes para no duplicar
        try:
            resp = client.get("/notebooks")
            resp.raise_for_status()
            existing_notebooks = {nb["name"]: nb["id"] for nb in resp.json()}
        except Exception as e:
            print(f"Advertencia: no se pudo obtener notebooks existentes: {e}")
            existing_notebooks = {}

        # PROCESAR CADA RAMO
        for slug, r2_files in archivos_por_ramo.items():
            meta = ramos_meta.get(slug)
            
            if meta:
                nb_name = f"[{meta['codigo']}] {meta['nombre']}"
                desc = f"Ramo {meta['nombre']} ({meta['codigo']}) — Programa {meta['programa_nombre']}"
            else:
                # Fallback si R2 tiene un ramo que NO está en los JSON locales
                prog, cod = slug.split("/", 1)
                nb_name = f"[{cod}] Ramo Importado de R2"
                desc = f"Ramo recuperado desde archivos en R2 ({slug})"

            # 3. CREAR NOTEBOOK (si no existe)
            nb_id = existing_notebooks.get(nb_name)
            if not nb_id:
                try:
                    res = client.post("/notebooks", json={"name": nb_name, "description": desc})
                    res.raise_for_status()
                    nb_data = res.json()
                    nb_id = nb_data.get("id") or str(nb_data)
                    existing_notebooks[nb_name] = nb_id
                    print(f"Notebook creado: {nb_name} -> {nb_id}")
                except Exception as e:
                    print(f"Error creando notebook {nb_name}: {e}")
                    continue
            else:
                print(f"Notebook ya existe: {nb_name} -> {nb_id}")

            notebook_mapping[slug] = nb_id

            # 4. INGESTAR ARCHIVOS (Sources) AL NOTEBOOK
            for key in r2_files:
                if key.endswith('/'):
                    print(f"  [Directorio omitido] {key}")
                    continue

                filename = key.split("/")[-1]
                
                # Encode path para que los espacios u otros caracteres se transformen a %20
                import urllib.parse
                url_encoded_key = urllib.parse.quote(key)
                
                public_url = f"{R2_PUBLIC_DOMAIN}/{url_encoded_key}" if R2_PUBLIC_DOMAIN else url_encoded_key
                
                # Engañamos a Jina agregando algo al final de la URL si no detecta la extensión
                # Como Cloudflare ignora los query params si no están configurados para cache, podemos usar esto:
                if not public_url.lower().endswith('.pdf'):
                    public_url = f"{public_url}?type=.pdf"
                
                title = os.path.splitext(filename)[0]

                try:
                    res = client.post(
                        "/sources/json",
                        json={
                            "type": "link",
                            "url": public_url,
                            "title": title,
                            "notebooks": [nb_id],
                            "embed": True
                        },
                    )
                    if res.status_code == 409:
                        print(f"  [Archivo existe] {key}")
                        continue
                    if not res.is_success:
                        print(f"  [Error archivo] {key} : {res.status_code} {res.text}")
                        continue
                        
                    print(f"  [Archivo Ingestado] {key} -> {nb_id}")
                except Exception as e:
                    print(f"  [Error llamada API] {key}: {e}")

    # 5. ACTUALIZAR MAPPING PARA EL FRONTEND
    output_map.parent.mkdir(parents=True, exist_ok=True)
    with open(output_map, "w", encoding="utf-8") as f:
        json.dump(notebook_mapping, f, indent=2, ensure_ascii=False)
        
    print(f"\n¡Listo! {len(notebook_mapping)} mapeos escritos en {output_map}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingesta archivos desde R2 a Notebooks unificados")
    parser.add_argument(
        "--epauta-data",
        type=Path,
        default=Path(__file__).resolve().parent.parent.parent / "epauta" / "src" / "data",
        help="Ruta a los JSONs locales de ePAUTA",
    )
    parser.add_argument(
        "--output-map",
        type=Path,
        default=Path(__file__).resolve().parent.parent.parent / "epauta" / "src" / "data" / "notebook_mapping.json",
        help="Archivo donde guardar el JSON con el mapeo que usará el Frontend",
    )
    args = parser.parse_args()
    main(args.epauta_data, args.output_map)
