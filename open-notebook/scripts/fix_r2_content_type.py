#!/usr/bin/env python3
"""
Migración one-time: corrige el Content-Type de todos los objetos en R2.

Los archivos fueron subidos sin extensión (e.g. "Pauta Control 1 2022-2" en vez de
"Pauta Control 1 2022-2.pdf"), por lo que R2 les asignó Content-Type incorrecto
(application/octet-stream o text/plain). content-core detecta el tipo por el
Content-Type del HEAD request, por lo que no los reconoce como PDFs y los trata
como páginas web → no extrae texto → los sources quedan atascados en "running".

Este script:
1. Lista todos los objetos del bucket.
2. Detecta su tipo real via magic bytes (descargando los primeros 512 bytes).
3. Hace un copy-in-place (CopyObject) para actualizar el Content-Type en los metadatos.
4. Es idempotente: salta objetos que ya tienen el Content-Type correcto.

Usage:
    python scripts/fix_r2_content_type.py [--dry-run] [--prefix eii/]

Environment variables (required):
    R2_ENDPOINT          — e.g. https://<account>.r2.cloudflarestorage.com
    R2_ACCESS_KEY_ID     — R2 API token access key
    R2_SECRET_ACCESS_KEY — R2 API token secret
    R2_BUCKET_NAME       — bucket name (default: epauta)
"""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ---------------------------------------------------------------------------
# Magic-bytes MIME detection (no libmagic needed)
# ---------------------------------------------------------------------------

MAGIC_SIGNATURES: list[tuple[bytes, str]] = [
    (b"%PDF",          "application/pdf"),
    (b"\xff\xd8\xff",  "image/jpeg"),
    (b"\x89PNG\r\n",   "image/png"),
    (b"GIF87a",        "image/gif"),
    (b"GIF89a",        "image/gif"),
    (b"PK\x03\x04",   "application/zip"),
    (b"<html",         "text/html"),
    (b"<!DOCTYPE",     "text/html"),
]

# Extension fallback — for objects that have no extension but whose name ends
# with a known suffix after the last dot, if any.
EXTENSION_MIME: dict[str, str] = {
    ".pdf":  "application/pdf",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".gif":  "image/gif",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt":  "text/plain",
    ".html": "text/html",
    ".htm":  "text/html",
}

DEFAULT_MIME = "application/pdf"  # Fallback seguro: todos los archivos de ePauta son PDFs


def detect_mime_from_bytes(header: bytes, key: str) -> str:
    """Detecta el MIME type a partir de magic bytes y extensión como fallback."""
    # 1. Magic bytes
    for signature, mime in MAGIC_SIGNATURES:
        if header.startswith(signature):
            return mime

    # 2. Extensión del key
    suffix = Path(key).suffix.lower()
    if suffix in EXTENSION_MIME:
        return EXTENSION_MIME[suffix]

    # 3. Fallback: asumir PDF (todos los archivos de ePauta son PDFs)
    return DEFAULT_MIME


# ---------------------------------------------------------------------------
# Main migration
# ---------------------------------------------------------------------------

def fix_content_types(prefix: str, dry_run: bool) -> None:
    try:
        import boto3
        from botocore.exceptions import ClientError
    except ImportError:
        print("boto3 es requerido: pip install boto3")
        sys.exit(1)

    endpoint   = os.environ.get("R2_ENDPOINT")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket     = os.environ.get("R2_BUCKET_NAME", "epauta")

    if not endpoint or not access_key or not secret_key:
        print("Error: R2_ENDPOINT, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY deben estar definidos")
        sys.exit(1)

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )

    print(f"Bucket: {bucket}")
    print(f"Prefix: '{prefix}' (vacío = todos los objetos)")
    print(f"Modo:   {'DRY RUN (sin cambios)' if dry_run else 'REAL (aplicando cambios)'}")
    print()

    paginator = s3.get_paginator("list_objects_v2")
    list_kwargs: dict = {"Bucket": bucket}
    if prefix:
        list_kwargs["Prefix"] = prefix

    total = skipped = fixed = errors = 0

    for page in paginator.paginate(**list_kwargs):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            total += 1

            # Saltar directory markers
            if key.endswith("/"):
                skipped += 1
                continue

            try:
                # Obtener Content-Type actual
                head = s3.head_object(Bucket=bucket, Key=key)
                current_ct = head.get("ContentType", "")

                # Descargar los primeros 512 bytes para detectar el tipo real
                range_resp = s3.get_object(Bucket=bucket, Key=key, Range="bytes=0-511")
                header_bytes = range_resp["Body"].read()

                correct_ct = detect_mime_from_bytes(header_bytes, key)

                # Normalizar: ignorar parámetros como "application/pdf; charset=utf-8"
                current_base = current_ct.split(";")[0].strip().lower()

                if current_base == correct_ct.lower():
                    print(f"  [ok]    {key}  ({current_ct})")
                    skipped += 1
                    continue

                print(f"  [fix]   {key}")
                print(f"          {current_ct or '(vacío)'} → {correct_ct}")

                if not dry_run:
                    # CopyObject in-place es la forma correcta de actualizar metadatos en S3/R2
                    s3.copy_object(
                        Bucket=bucket,
                        CopySource={"Bucket": bucket, "Key": key},
                        Key=key,
                        ContentType=correct_ct,
                        MetadataDirective="REPLACE",  # Reemplaza todos los metadatos
                    )
                    print(f"          ✓ actualizado")

                fixed += 1

            except ClientError as e:
                code = e.response["Error"]["Code"]
                print(f"  [error] {key}: {code} — {e}")
                errors += 1
            except Exception as e:
                print(f"  [error] {key}: {e}")
                errors += 1

    print()
    print(f"{'=' * 60}")
    print(f"Total:    {total}")
    print(f"OK (sin cambio): {skipped}")
    print(f"{'Necesitan fix' if dry_run else 'Corregidos'}: {fixed}")
    print(f"Errores:  {errors}")

    if dry_run and fixed > 0:
        print()
        print(f"Para aplicar los {fixed} cambios, ejecuta sin --dry-run:")
        print(f"  python scripts/fix_r2_content_type.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Corrige Content-Type de objetos en R2 para que content-core los detecte como PDFs"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo muestra qué cambiaría, sin modificar nada",
    )
    parser.add_argument(
        "--prefix",
        default="",
        help="Limitar a un prefijo del bucket (e.g. 'eii/'). Por defecto procesa todo.",
    )
    args = parser.parse_args()
    fix_content_types(prefix=args.prefix, dry_run=args.dry_run)