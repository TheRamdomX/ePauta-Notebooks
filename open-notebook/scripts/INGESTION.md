# R2 to Open Notebook Ingestion Guide

Este documento describe cómo ingestar archivos desde Cloudflare R2 hacia Open Notebook, creando Sources que se vinculan automáticamente a los Notebooks correspondientes.

## Arquitectura

```
Cloudflare R2 bucket (epauta)
    ├── programa/
    │   └── CODIGO/
    │       ├── archivo1.pdf
    │       ├── archivo2.pdf
    │       └── ...
    │
    ↓ (sync_r2_sources.py)
    │
Open Notebook Database
    ├── Notebooks (creados por bootstrap_epauta_notebooks.py)
    │   └── [CODIGO] Nombre del Ramo
    │       ├── Sources (creados por sync_r2_sources.py)
    │       │   ├── Link: https://r2-epauta.samuelangulo.com/programa/CODIGO/archivo1.pdf
    │       │   ├── Link: https://r2-epauta.samuelangulo.com/programa/CODIGO/archivo2.pdf
    │       │   └── ...
    │       │
    │       └── Chat accede a estas fuentes cuando procesa preguntas
```

## Requisitos Previos

### 1. Variables de entorno en `.env`

```bash
# Conexión a Open Notebook API
OPEN_NOTEBOOK_API=http://localhost:5055/api

# Credenciales R2
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<tu-access-key>
R2_SECRET_ACCESS_KEY=<tu-secret-key>
R2_BUCKET_NAME=epauta
R2_PUBLIC_DOMAIN=https://r2-epauta.samuelangulo.com
```

### 2. API Open Notebook debe estar corriendo

```bash
docker-compose up -d
```

Verifica que la API está lista:
```bash
curl http://localhost:5055/api/health
```

### 3. Dependencias Python

```bash
pip install httpx boto3
```

## Workflow Completo

### Paso 1: Crear Notebooks para cada ramo

```bash
cd /path/to/open-notebook
source .venv/bin/activate
python scripts/bootstrap_epauta_notebooks.py
```

**Qué hace:**
- Lee cursos desde ePAUTA (`epauta/src/data/`)
- Crea un Notebook en Open Notebook para cada ramo
- Genera `notebook_mapping.json` con el mapeo: `programa/CODIGO` → `notebook_id`

**Salida:**
```
Found 83 ramos across 4 programmes
API: http://localhost:5055/api

  [created] [CBM-1000] Álgebra y geometría -> notebook:99zpsllc04mlck8bclwr
  [created] [CIT-1000] Programación -> notebook:z3rk3v0qxs7hy550oo8j
  ...

Done: 83 mapped, 0 errors
Mapping written to /path/to/open-notebook/scripts/notebook_mapping.json
```

### Paso 2: Ingestar archivos de R2

```bash
python scripts/sync_r2_sources.py
```

**Opcional:** Usa otro archivo de mapping
```bash
python scripts/sync_r2_sources.py --mapping /ruta/a/otro/mapping.json
```

**Qué hace:**
- Lista 784 archivos en R2 bucket
- Para cada archivo `programa/CODIGO/archivo.pdf`:
  - Busca el `notebook_id` en el mapping
  - Crea un Source de tipo `link` con la URL pública
  - Vincula el Source al Notebook correspondiente
- Evita duplicados: si la URL ya existe, salta el archivo

**Salida:**
```
Loaded 83 notebook mappings
Listing files in R2 bucket 'epauta'...
Found 784 files in R2

  [synced] eii/CII-2003/Control 1 2022-2 -> eii/CII-2003
  [synced] eii/CII-2003/Pauta Control 1 2019-1 -> eii/CII-2003
  ...
  [exists] plan-comun/CBM-1000/ejemplo.pdf (ya existe)
  
Done: 765 synced, 19 skipped, 0 errors
```

## Verificación

### 1. Desde Open Notebook API

```bash
# Ver un notebook específico
curl http://localhost:5055/api/notebooks/notebook:z3rk3v0qxs7hy550oo8j

# Ver sources de un notebook
curl http://localhost:5055/api/notebooks/notebook:z3rk3v0qxs7hy550oo8j/sources
```

### 2. Desde ePAUTA

1. Abre http://localhost:4321
2. Navega a un curso (ej: `CIT-1000`)
3. En el panel de chat, haz una pregunta
4. El chat debería consultar los archivos ingestados

### 3. Desde SurrealDB (opcional)

```bash
# Conectar a la BD
surreal sql --endpoint ws://localhost:8000 --namespace open_notebook --database open_notebook --username root --password root

# Ver notebooks
SELECT * FROM notebook;

# Ver sources
SELECT * FROM source;

# Ver relaciones
SELECT * FROM notebook_source;
```

## Casos de Uso

### Re-sincronizar después de agregar nuevos archivos a R2

```bash
python scripts/sync_r2_sources.py
```

El script es idempotente: archivos ya sincronizados se saltarán automáticamente.

### Limpiar y sincronizar desde cero

```bash
# 1. Limpiar notebooks (opcional, destructivo)
# Desde la API: DELETE /notebooks/{id}
# O desde SurrealDB: DELETE notebook, DELETE source;

# 2. Re-crear notebooks
python scripts/bootstrap_epauta_notebooks.py

# 3. Re-sincronizar archivos
python scripts/sync_r2_sources.py
```

### Cambiar dominio público de R2

Si cambias el dominio público de R2, actualiza `.env`:

```bash
R2_PUBLIC_DOMAIN=https://nuevo-dominio.com
```

Luego re-sincroniza. Los nuevos files usarán el nuevo dominio. Los viejos archivos con URLs antiguas seguirán funcionando si apuntan al mismo destino.

## Troubleshooting

### Error: "Mapping is empty"

```
Mapping is empty. Run bootstrap_epauta_notebooks.py first.
```

**Solución:** Ejecuta el script de bootstrap primero.

### Error: "No notebook found for prefix"

```
[skipped] xxx/YYY/file.pdf (no mapping)
```

**Solución:** El curso `xxx/YYY` no está en `notebook_mapping.json`. Verifica que:
1. Existe en `epauta/src/data/`
2. Fue creado por `bootstrap_epauta_notebooks.py`

### Error: "R2_ENDPOINT not set"

```
Error: R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set
```

**Solución:** Configura las variables en `.env`:

```bash
R2_ENDPOINT=https://...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

### API lenta o timeout

Si `sync_r2_sources.py` tarda mucho o falla:

1. Verifica que la API está corriendo:
   ```bash
   docker-compose ps
   ```

2. Aumenta el timeout:
   ```bash
   # En sync_r2_sources.py, línea 95
   with httpx.Client(base_url=API_BASE, timeout=300) as client:  # 300 segundos
   ```

## Logging y Debug

Para ver más detalles durante la sincronización, modifica `sync_r2_sources.py`:

```python
# Agregar antes de try/except
print(f"Processing: {key} -> {slug} -> {notebook_id}")
print(f"Creating source: {public_url}")
```

## API Endpoints Utilizados

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/notebooks` | Listar todos los notebooks |
| POST | `/sources/json` | Crear un source de tipo link |
| POST | `/notebooks/{id}/sources/{source_id}` | Vincular source a notebook |

## Performance

- **784 archivos**: ~2-5 minutos (depende de latencia de red)
- **Primer run**: más lento (crea 783 sources)
- **Runs posteriores**: más rápido (salta existentes)

Optimización: El script procesa archivos secuencialmente. Para paralelizar:

```python
# Usar ThreadPoolExecutor
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=10) as executor:
    executor.map(process_file, files)
```

## Notas

- **Idempotencia**: Los scripts son seguros para re-ejecutar
- **Backups**: Los notebooks y sources se guardan en SurrealDB (volumen Docker)
- **Privacidad**: Los URLs de R2 son públicas (configuradas en `R2_PUBLIC_DOMAIN`)
