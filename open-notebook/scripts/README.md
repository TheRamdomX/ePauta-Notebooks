# Scripts Documentation

## export_docs.py

Consolidates markdown documentation files for use with ChatGPT or other platforms with file upload limits.

### What It Does

- Scans all subdirectories in the `docs/` folder
- For each subdirectory, combines all `.md` files (excluding `index.md` files)
- Creates one consolidated markdown file per subdirectory
- Saves all exported files to `doc_exports/` in the project root

### Usage

```bash
# Using Makefile (recommended)
make export-docs

# Or run directly with uv
uv run python scripts/export_docs.py

# Or run with standard Python
python scripts/export_docs.py
```

### Output

The script creates `doc_exports/` directory with consolidated files like:

- `getting-started.md` - All getting-started documentation
- `user-guide.md` - All user guide content
- `features.md` - All feature documentation
- `development.md` - All development documentation
- etc.

Each exported file includes:
- A main header with the folder name
- Section headers for each source file
- Source file attribution
- The complete content from each markdown file
- Visual separators between sections

### Example Output Structure

```markdown
# Getting Started

This document consolidates all content from the getting-started documentation folder.

---

## Installation

*Source: installation.md*

[Full content of installation.md]

---

## Quick Start

*Source: quick-start.md*

[Full content of quick-start.md]

---
```

### Notes

- The `doc_exports/` directory is gitignored and safe to regenerate anytime
- Index files (`index.md`) are automatically excluded
- Files are sorted alphabetically for consistent output
- The script handles subdirectories only (ignores files in the root `docs/` folder)

---

## bootstrap_epauta_notebooks.py

Creates Open Notebook notebooks for all ePAUTA courses and generates a mapping file.

### What It Does

1. Reads course data from ePAUTA (`epauta/src/data/`)
2. Creates a Notebook in Open Notebook for each course
3. Generates `notebook_mapping.json` that maps `programa/CODIGO` → `notebook_id`

### Usage

```bash
# Default (assumes sibling ../epauta directory)
python scripts/bootstrap_epauta_notebooks.py

# Custom paths
python scripts/bootstrap_epauta_notebooks.py \
    --epauta-data ../epauta/src/data \
    --api http://localhost:5055/api \
    --output scripts/notebook_mapping.json
```

### Output

```
Found 83 ramos across 4 programmes
API: http://localhost:5055/api

  [created] [CBM-1000] Álgebra y geometría -> notebook:99zpsllc04mlck8bclwr
  [created] [CIT-1000] Programación -> notebook:z3rk3v0qxs7hy550oo8j
  ...

Done: 83 mapped, 0 errors
Mapping written to /path/to/notebook_mapping.json
```

### Prerequisites

- Open Notebook API running (`docker-compose up -d`)
- Python httpx installed

---

## sync_r2_sources.py

Ingests files from Cloudflare R2 into Open Notebook as Sources linked to Notebooks.

### What It Does

1. Lists all files in R2 bucket (`epauta`)
2. For each file `programa/CODIGO/archivo.pdf`:
   - Creates a Source of type `link` with the public URL
   - Links the Source to the corresponding Notebook
3. Is idempotent: re-running skips already-ingested sources

### Usage

```bash
# Default (uses notebook_mapping.json)
python scripts/sync_r2_sources.py

# Custom mapping
python scripts/sync_r2_sources.py --mapping /path/to/mapping.json
```

### Output

```
Loaded 83 notebook mappings
Listing files in R2 bucket 'epauta'...
Found 784 files in R2

  [synced] eii/CII-2003/Control 1 2022-2 -> eii/CII-2003
  [synced] eii/CII-2003/Pauta Control 1 2019-1 -> eii/CII-2003
  ...
  [exists] plan-comun/CBM-1000/ejemplo.pdf (already ingested)
  
Done: 765 synced, 19 skipped, 0 errors
```

### Prerequisites

- Open Notebook API running
- Notebooks created by `bootstrap_epauta_notebooks.py`
- R2 credentials in `.env`:
  ```bash
  R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET_NAME=epauta
  R2_PUBLIC_DOMAIN=https://r2-epauta.samuelangulo.com
  ```

### Complete Workflow

```bash
# 1. Create notebooks
python scripts/bootstrap_epauta_notebooks.py

# 2. Ingest R2 files
python scripts/sync_r2_sources.py

# 3. Done! Files are now available to the chat AI
```

For detailed setup and troubleshooting, see [INGESTION.md](INGESTION.md).
