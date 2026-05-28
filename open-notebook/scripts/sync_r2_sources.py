#!/usr/bin/env python3
"""
Sync Cloudflare R2 files into open-notebook as Sources linked to Notebooks.

For every file in the R2 bucket whose prefix matches a slug in the
notebook_mapping.json, this script:

1. Creates a Source of type ``link`` with the public URL.
2. Links (RELATE) the Source to the corresponding Notebook.

Idempotent: re-running skips sources whose URL already exists.

Usage:
    python scripts/sync_r2_sources.py \
        --mapping scripts/notebook_mapping.json

Environment variables (required):
    R2_ENDPOINT          — e.g. https://<account>.r2.cloudflarestorage.com
    R2_ACCESS_KEY_ID     — R2 API token access key
    R2_SECRET_ACCESS_KEY — R2 API token secret
    R2_BUCKET_NAME       — bucket name (default: epauta)
    R2_PUBLIC_DOMAIN     — public domain for file URLs

Optional:
    OPEN_NOTEBOOK_API    — API base (default: http://localhost:5055/api)
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

R2_ENDPOINT = os.environ.get("R2_ENDPOINT")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "epauta")
R2_PUBLIC_DOMAIN = os.environ.get("R2_PUBLIC_DOMAIN")



def list_r2_files() -> list[str]:
    """List all object keys in the R2 bucket via the S3-compatible API."""
    try:
        import boto3
    except ImportError:
        print("boto3 is required: pip install boto3")
        sys.exit(1)

    if not R2_ENDPOINT or not R2_ACCESS_KEY_ID or not R2_SECRET_ACCESS_KEY:
        print("Error: R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set")
        sys.exit(1)

    s3 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    )
    paginator = s3.get_paginator("list_objects_v2")
    keys: list[str] = []
    for page in paginator.paginate(Bucket=R2_BUCKET_NAME):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])
    return keys


def sync(mapping_path: Path) -> None:
    with open(mapping_path, encoding="utf-8") as f:
        mapping: dict[str, str] = json.load(f)  # slug -> notebook_id

    if not mapping:
        print("Mapping is empty. Run bootstrap_epauta_notebooks.py first.")
        sys.exit(1)

    print(f"Loaded {len(mapping)} notebook mappings")
    print(f"Listing files in R2 bucket '{R2_BUCKET_NAME}'...")

    files = list_r2_files()
    print(f"Found {len(files)} files in R2\n")

    created = 0
    skipped = 0
    errors = 0

    with httpx.Client(base_url=API_BASE, timeout=60) as client:
        for key in files:
            # ePAUTA stores files as: <programa>/<CODIGO>/filename.ext
            # e.g. eit/CIT-1010/apunte.pdf
            # The slug in our mapping is "<programa>/<CODIGO>"
            parts = key.split("/")
            if len(parts) < 3:
                # Not a valid file path (might be a directory marker)
                continue

            slug = f"{parts[0]}/{parts[1]}"
            notebook_id = mapping.get(slug)
            if not notebook_id:
                skipped += 1
                continue

            filename = parts[-1]
            public_url = f"{R2_PUBLIC_DOMAIN}/{key}" if R2_PUBLIC_DOMAIN else key
            title = os.path.splitext(filename)[0]

            try:
                # Create Source with notebook linkage (include notebooks in payload)
                resp = client.post(
                    "/sources/json",
                    json={
                        "type": "link",
                        "url": public_url,
                        "title": title,
                        "notebooks": [notebook_id],  # Link to notebook during creation
                        "embed": True,  # Enable embedding for AI context
                    },
                )
                if resp.status_code == 409:
                    # Source with this URL likely already exists
                    print(f"  [exists] {key}")
                    skipped += 1
                    continue

                if not resp.is_success:
                    error_detail = resp.text
                    try:
                        error_json = resp.json()
                        error_detail = error_json.get("detail", str(error_json))
                    except:
                        pass
                    print(f"  [error] {key}: HTTP {resp.status_code} - {error_detail}")
                    errors += 1
                    continue

                resp.raise_for_status()
                source_data = resp.json()

                # The API may return the source nested or flat
                source_id = (
                    source_data.get("id")
                    or source_data.get("source", {}).get("id")
                )
                if not source_id:
                    print(f"  [warn] No source ID returned for {key}")
                    errors += 1
                    continue

                print(f"  [synced] {key} -> {slug}")
                created += 1

            except Exception as e:
                print(f"  [error] {key}: {e}")
                errors += 1

    print(f"\nDone: {created} synced, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync R2 sources to open-notebook")
    parser.add_argument(
        "--mapping",
        type=Path,
        default=Path(__file__).resolve().parent / "notebook_mapping.json",
        help="Path to notebook_mapping.json",
    )
    args = parser.parse_args()
    sync(args.mapping)
