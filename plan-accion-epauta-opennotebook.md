# Plan de Acción: Integración open-notebook como Backend de ePAUTA

> **Objetivo:** Convertir open-notebook en el motor de inteligencia (backend puro) de ePAUTA, eliminando su frontend propio, y hacer que ePAUTA sea el único visualizador/cliente. Cada ramo universitario se mapea a un Notebook en open-notebook. La arquitectura cloud usa exclusivamente Google AI Studio (Gemini) como proveedor de LLM y embeddings, con Redis como capa de caché.

---

## Arquitectura objetivo

```
┌─────────────────────────────┐
│         ePAUTA              │  ← Frontend Astro/React (solo visualizador)
│  (Astro + React + R2)       │     - Visualiza PDFs desde Cloudflare R2
│                             │     - Consultas RAG por ramo
│  Cada ramo = 1 Notebook     │     - Streaming de respuestas (SSE)
└──────────┬──────────────────┘
           │ HTTP REST + SSE
           ▼
┌─────────────────────────────┐
│      Redis Cache Layer      │  ← Caché de respuestas, sesiones, contextos
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   open-notebook (API Only)  │  ← Backend Python/FastAPI
│   Puerto 5055               │     - Procesamiento de PDFs (R2)
│                             │     - Embeddings (Gemini)
│                             │     - Chat / RAG / Search
│                             │     - Gestión de Notebooks
└──────────┬──────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐  ┌──────────┐
│SurrealDB│  │Google AI │
│         │  │Studio    │
│(vectores│  │(Gemini   │
│+ datos) │  │LLM +     │
└─────────┘  │Embeddings│
             └──────────┘
```

---

## FASE 1 — Limpieza y preparación de open-notebook

### Paso 1.1 — Eliminar el frontend de open-notebook

open-notebook tiene su frontend en `frontend/` (Next.js/React). Se elimina completamente ya que ePAUTA tomará ese rol.

**Archivos y carpetas a eliminar en el repo `lfnovo/open-notebook`:**

```
frontend/                          ← eliminar directorio completo
Dockerfile.single                  ← era para correr frontend+backend juntos
supervisord.single.conf            ← lo mismo
```

**Modificar `docker-compose.yml`:** Eliminar cualquier servicio que levante el frontend (típicamente un servicio `frontend` o `open_notebook_ui` en el compose). Solo deben quedar:

- `surrealdb`
- `open_notebook` (el API en puerto 5055)
- `redis` ← nuevo servicio a agregar

**Modificar `supervisord.conf`:** Remover entradas que arranquen el servidor Next.js. Dejar solo los workers de Python (API FastAPI, workers de comandos/embeddings).

**Modificar `Dockerfile`:** Si el Dockerfile actual copia o instala dependencias del frontend (npm install, next build), remover esas instrucciones. El contenedor final solo debe contener el entorno Python.

---

### Paso 1.2 — Configurar Google AI Studio como único proveedor

open-notebook usa la librería `esperanto` para abstracción de proveedores. Google GenAI (Gemini) ya está soportado con LLM y embeddings.

**Archivo `.env.example` — agregar/modificar estas variables:**

```env
# Proveedor de LLM y Embeddings
GOOGLE_API_KEY=your_google_ai_studio_key_here

# Eliminar las variables de otros proveedores:
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# GROQ_API_KEY=
# etc.
```

**Lógica de modelos por defecto (`open_notebook/config/` o similar):**

Buscar en el código fuente dónde se definen los modelos por defecto (puede estar en `open_notebook/models/` o en la lógica de `PUT /models/defaults`). Establecer valores hardcodeados para Google como fallback cuando no hay configuración en DB:

```python
DEFAULT_LLM_PROVIDER = "google"
DEFAULT_LLM_MODEL = "gemma-4-31b-it"        # arbitrario 
DEFAULT_EMBEDDING_PROVIDER = "google"
DEFAULT_EMBEDDING_MODEL = "text-embedding-004" # arbitrario 
```

**Eliminar código de providers no usados:** En `open_notebook/providers/` (o equivalente), si existe código específico para cada proveedor más allá de `esperanto`, eliminar los módulos de OpenAI, Anthropic, Ollama, etc. que no sean Google. Si todo pasa por `esperanto`, solo asegurarse de no incluir dependencias innecesarias en `pyproject.toml`.

**`pyproject.toml` — limpiar dependencias opcionales:**

Si hay extras como `esperanto[openai]`, `esperanto[anthropic]`, etc., reemplazar con solo `esperanto[google]`. Verificar también si hay dependencias directas a `openai`, `anthropic`, `groq` — removerlas.

---

### Paso 1.3 — Implementar la capa de caché con Redis

Redis actuará como caché en tres niveles: respuestas de chat, contextos de notebook y resultados de búsqueda semántica.

**Agregar dependencias en `pyproject.toml`:**

```toml
[project.dependencies]
# ... existentes ...
redis = ">=5.0.0"
```

**Nuevo archivo: `open_notebook/cache/redis_client.py`**

```python
import redis.asyncio as redis
import os
import json
import hashlib
from typing import Any, Optional

_client: Optional[redis.Redis] = None

def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(
            os.environ.get("REDIS_URL", "redis://localhost:6379"),
            decode_responses=True
        )
    return _client

async def cache_get(key: str) -> Optional[Any]:
    client = get_redis()
    value = await client.get(key)
    if value:
        return json.loads(value)
    return None

async def cache_set(key: str, value: Any, ttl: int = 3600) -> None:
    client = get_redis()
    await client.setex(key, ttl, json.dumps(value, default=str))

async def cache_delete(key: str) -> None:
    client = get_redis()
    await client.delete(key)

async def cache_delete_pattern(pattern: str) -> None:
    client = get_redis()
    keys = await client.keys(pattern)
    if keys:
        await client.delete(*keys)

def make_cache_key(prefix: str, *args) -> str:
    """Genera una clave de caché determinística."""
    raw = ":".join(str(a) for a in args)
    hash_part = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"epauta:{prefix}:{hash_part}"
```

**TTLs recomendados por tipo de caché:**

| Tipo de caché | TTL | Justificación |
|---|---|---|
| Contexto de notebook (fuentes+notas) | 1 hora | Cambia solo si se agrega contenido |
| Resultados de búsqueda semántica | 30 min | Embeddings no cambian frecuentemente |
| Respuestas de `/search/ask` | 15 min | Consultas repetidas comunes |
| Lista de notebooks | 5 min | Datos estructurales, cambian poco |
| Lista de fuentes por notebook | 5 min | Idem |
| Sesiones de chat | No cachear | Son stateful y únicas por usuario |

**Nuevo archivo: `open_notebook/cache/invalidation.py`**

```python
"""
Lógica de invalidación de caché cuando el contenido cambia.
Llamar estas funciones desde los endpoints de escritura.
"""
from open_notebook.cache.redis_client import cache_delete_pattern

async def invalidate_notebook_cache(notebook_id: str):
    """Invalidar cuando se modifica un notebook o sus fuentes/notas."""
    await cache_delete_pattern(f"epauta:notebook_context:{notebook_id}*")
    await cache_delete_pattern(f"epauta:notebook_list:*")
    await cache_delete_pattern(f"epauta:sources:{notebook_id}*")

async def invalidate_source_cache(source_id: str, notebook_id: str = None):
    """Invalidar cuando se procesa o modifica una fuente."""
    await cache_delete_pattern(f"epauta:source:{source_id}*")
    if notebook_id:
        await invalidate_notebook_cache(notebook_id)

async def invalidate_search_cache(notebook_id: str = None):
    """Invalidar resultados de búsqueda."""
    if notebook_id:
        await cache_delete_pattern(f"epauta:search:{notebook_id}*")
    else:
        await cache_delete_pattern(f"epauta:search:*")
```

**Modificar endpoints existentes para usar caché:**

En `api/routers/notebooks.py` (o el archivo correspondiente), en el endpoint `POST /notebooks/{id}/context`:

```python
from open_notebook.cache.redis_client import cache_get, cache_set, make_cache_key

# Antes de construir el contexto, verificar caché
cache_key = make_cache_key("notebook_context", notebook_id, str(config))
cached = await cache_get(cache_key)
if cached:
    return cached

# ... lógica existente de construcción de contexto ...

# Guardar en caché antes de retornar
await cache_set(cache_key, result, ttl=3600)
return result
```

En `api/routers/search.py`, en `POST /search/ask/simple`:

```python
cache_key = make_cache_key("search_ask", query, notebook_id or "global")
cached = await cache_get(cache_key)
if cached:
    return cached
# ... lógica existente ...
await cache_set(cache_key, result, ttl=900)
return result
```

En `api/routers/search.py`, en `POST /search` (búsqueda vectorial):

```python
cache_key = make_cache_key("search", query, notebook_id or "global", mode)
cached = await cache_get(cache_key)
if cached:
    return cached
# ... lógica existente ...
await cache_set(cache_key, result, ttl=1800)
return result
```

**Agregar Redis al `docker-compose.yml`:**

```yaml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes
    ports:
      - "6379:6379"
    restart: always
    volumes:
      - ./redis_data:/data

  open_notebook:
    # ... config existente ...
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - surrealdb
      - redis
```

**Variable de entorno en `.env.example`:**

```env
REDIS_URL=redis://localhost:6379
```

---

### Paso 1.4 — Configurar CORS para permitir peticiones desde ePAUTA

El API de open-notebook en FastAPI necesita aceptar peticiones del dominio de ePAUTA (Vercel).

**En `run_api.py` o en el archivo de creación de la app FastAPI:**

```python
from fastapi.middleware.cors import CORSMiddleware
import os

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.environ.get("EPAUTA_ORIGIN", "https://epauta.vercel.app"),
        "http://localhost:4321",  # desarrollo local de ePAUTA
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "HEAD"],
    allow_headers=["*"],
)
```

**Nueva variable de entorno en `.env.example`:**

```env
EPAUTA_ORIGIN=https://epauta.vercel.app
```

---

### Paso 1.5 — Script de inicialización: crear notebooks por ramo

Dado que cada ramo de ePAUTA debe existir como un Notebook en open-notebook, se necesita un script de bootstrapping que cree los notebooks correspondientes y los almacene para que ePAUTA pueda hacer referencia a ellos por ID.

**Nuevo archivo: `scripts/bootstrap_epauta_notebooks.py`**

```python
"""
Script de inicialización: crea un Notebook en open-notebook
por cada ramo definido en la configuración de ePAUTA.

Uso: python scripts/bootstrap_epauta_notebooks.py
"""

import httpx
import json
import os

API_BASE = os.environ.get("OPEN_NOTEBOOK_API", "http://localhost:5055/api")

# Lista de ramos — parametrizar o leer desde un JSON externo con los ramos reales de ePAUTA
RAMOS = [
    {"nombre": "Cálculo I", "programa": "plan-comun", "slug": "calculo-1"},
    {"nombre": "Álgebra Lineal", "programa": "plan-comun", "slug": "algebra-lineal"},
    # ... agregar todos los ramos de ePAUTA ...
]

def bootstrap():
    created = {}
    with httpx.Client() as client:
        for ramo in RAMOS:
            response = client.post(f"{API_BASE}/notebooks", json={
                "name": ramo["nombre"],
                "description": f"Ramo {ramo['nombre']} - Programa {ramo['programa']}"
            })
            if response.status_code == 200:
                notebook = response.json()
                created[ramo["slug"]] = notebook["id"]
                print(f"Creado: {ramo['nombre']} -> {notebook['id']}")
            else:
                print(f"Error creando {ramo['nombre']}: {response.text}")

    # Guardar mapeo slug -> notebook_id para que ePAUTA lo consuma
    with open("scripts/notebook_mapping.json", "w") as f:
        json.dump(created, f, indent=2)
    print("\nMapeo guardado en scripts/notebook_mapping.json")

if __name__ == "__main__":
    bootstrap()
```

El archivo `notebook_mapping.json` generado será consumido por ePAUTA para saber qué Notebook ID corresponde a cada ramo.

---

### Paso 1.6 — Script de sincronización de fuentes (PDFs de R2 → open-notebook)

Cuando ePAUTA tiene PDFs almacenados en Cloudflare R2, estos deben ser ingestados por open-notebook como fuentes (Sources) del Notebook correspondiente.

**Nuevo archivo: `scripts/sync_r2_sources.py`**

```python
"""
Sincroniza las fuentes de Cloudflare R2 con open-notebook.
Para cada archivo en R2, crea una Source de tipo 'link' (URL pública de R2)
y la vincula al Notebook del ramo correspondiente.

Uso: python scripts/sync_r2_sources.py --mapping scripts/notebook_mapping.json
"""

import httpx
import json
import argparse
import boto3
import os

API_BASE = os.environ.get("OPEN_NOTEBOOK_API", "http://localhost:5055/api")
R2_ENDPOINT = os.environ.get("R2_ENDPOINT")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "epauta")
R2_PUBLIC_DOMAIN = os.environ.get("R2_PUBLIC_DOMAIN")

def list_r2_files():
    """Lista todos los archivos en el bucket R2 con su prefijo de ramo."""
    s3 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    )
    paginator = s3.get_paginator("list_objects_v2")
    files = []
    for page in paginator.paginate(Bucket=R2_BUCKET_NAME):
        for obj in page.get("Contents", []):
            files.append(obj["Key"])
    return files

def sync(mapping_path: str):
    with open(mapping_path) as f:
        mapping = json.load(f)  # {slug: notebook_id}

    files = list_r2_files()

    with httpx.Client(timeout=30) as client:
        for key in files:
            # Inferir slug del ramo desde la ruta del archivo
            # Ejemplo: "eit/calculo-1/apunte.pdf" -> slug = "calculo-1"
            # Ajustar el índice según la estructura real del bucket R2 de ePAUTA
            parts = key.split("/")
            if len(parts) < 2:
                continue
            slug = parts[-2]
            notebook_id = mapping.get(slug)
            if not notebook_id:
                print(f"Sin notebook para slug '{slug}' (archivo: {key})")
                continue

            public_url = f"{R2_PUBLIC_DOMAIN}/{key}"

            # Crear Source en open-notebook
            response = client.post(f"{API_BASE}/sources", json={
                "source_type": "link",
                "url": public_url,
                "title": parts[-1].replace(".pdf", ""),
            })

            if response.status_code != 200:
                print(f"Error creando source para {key}: {response.text}")
                continue

            source = response.json()
            source_id = source.get("id") or source.get("source", {}).get("id")

            # Vincular Source al Notebook
            link_response = client.post(
                f"{API_BASE}/notebooks/{notebook_id}/sources/{source_id}"
            )
            if link_response.status_code == 200:
                print(f"{key} -> Notebook '{slug}'")
            else:
                print(f"Error vinculando source: {link_response.text}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mapping", default="scripts/notebook_mapping.json")
    args = parser.parse_args()
    sync(args.mapping)
```

---


## FASE 2 — Refactorización de ePAUTA

### Paso 2.1 — Eliminar lógica de datos estáticos

ePAUTA actualmente almacena los datos de cursos en `src/data/` como archivos estáticos (JSON/TypeScript) divididos por programa (plan-comun, eit, eoc, eii). Esta lógica debe ser reemplazada por llamadas dinámicas a la API de open-notebook.

**Eliminar completamente:**

```
src/data/plan-comun/     ← eliminar directorio
src/data/eit/            ← eliminar directorio
src/data/eoc/            ← eliminar directorio
src/data/eii/            ← eliminar directorio
src/data/               ← si queda vacío, eliminar (salvo notebook_mapping.json)
```

Si existe algún archivo de tipos TypeScript en `src/data/` que define interfaces (ej. `types.ts`), moverlo a `src/types/` y conservar solo las interfaces, eliminando los datos hardcodeados.

---

### Paso 2.2 — Crear el cliente de API de open-notebook en ePAUTA

**Nuevo archivo: `src/lib/open-notebook.ts`**

```typescript
/**
 * Cliente HTTP para la API de open-notebook.
 * Centraliza todas las llamadas al backend.
 */

const API_BASE = import.meta.env.OPEN_NOTEBOOK_API_URL ?? "http://localhost:5055/api";

// ─── Tipos base ───────────────────────────────────────────────

export interface Notebook {
  id: string;
  name: string;
  description?: string;
  archived?: boolean;
  source_count?: number;
  note_count?: number;
}

export interface Source {
  id: string;
  title: string;
  source_type: string;
  url?: string;
  status?: string;
}

export interface Note {
  id: string;
  title?: string;
  content: string;
  note_type: string;
}

export interface ChatSession {
  id: string;
  title?: string;
  notebook_id: string;
}

export interface SearchResult {
  id: string;
  type: "source" | "note";
  title: string;
  content_snippet: string;
  score?: number;
}

// ─── Helpers ──────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`open-notebook API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ─── Notebooks ────────────────────────────────────────────────

export async function listNotebooks(): Promise<Notebook[]> {
  return apiFetch<Notebook[]>("/notebooks");
}

export async function getNotebook(id: string): Promise<Notebook> {
  return apiFetch<Notebook>(`/notebooks/${id}`);
}

// ─── Sources ──────────────────────────────────────────────────

export async function listSourcesByNotebook(notebookId: string): Promise<Source[]> {
  return apiFetch<Source[]>(`/sources?notebook_id=${notebookId}`);
}

export async function getSource(sourceId: string): Promise<Source> {
  return apiFetch<Source>(`/sources/${sourceId}`);
}

export function getSourceDownloadUrl(sourceId: string): string {
  return `${API_BASE}/sources/${sourceId}/download`;
}

// ─── Chat ─────────────────────────────────────────────────────

export async function createChatSession(notebookId: string): Promise<ChatSession> {
  return apiFetch<ChatSession>("/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ notebook_id: notebookId }),
  });
}

export async function getChatSession(sessionId: string): Promise<ChatSession> {
  return apiFetch<ChatSession>(`/chat/sessions/${sessionId}`);
}

/**
 * Ejecuta un turno de chat con streaming SSE.
 * Retorna el objeto Response para que el llamador consuma el stream.
 */
export async function executeChatStream(
  sessionId: string,
  message: string,
  notebookId: string
): Promise<Response> {
  return fetch(`${API_BASE}/chat/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      notebook_id: notebookId,
    }),
  });
}

// ─── Search ───────────────────────────────────────────────────

export async function searchInNotebook(
  query: string,
  notebookId: string,
  mode: "text" | "semantic" = "semantic"
): Promise<SearchResult[]> {
  return apiFetch<SearchResult[]>("/search", {
    method: "POST",
    body: JSON.stringify({ query, notebook_id: notebookId, mode }),
  });
}

/**
 * Consulta RAG con respuesta streaming SSE.
 */
export async function askNotebookStream(
  question: string,
  notebookId: string
): Promise<Response> {
  return fetch(`${API_BASE}/search/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: question, notebook_id: notebookId }),
  });
}

/**
 * Consulta RAG sin streaming (para SSR).
 */
export async function askNotebook(
  question: string,
  notebookId: string
): Promise<{ answer: string; sources: SearchResult[] }> {
  return apiFetch("/search/ask/simple", {
    method: "POST",
    body: JSON.stringify({ query: question, notebook_id: notebookId }),
  });
}
```

---

### Paso 2.3 — Crear el cliente de caché Redis en ePAUTA (capa de caché del frontend)

ePAUTA también puede cachear en Redis las respuestas del backend para evitar latencia en llamadas repetidas. Esto es especialmente útil en los endpoints de Astro con SSR.

**Nuevo archivo: `src/lib/redis.ts`**

```typescript
/**
 * Cliente Redis para caché en el servidor de ePAUTA (SSR).
 * Solo se usa en el contexto de servidor (páginas .astro con SSR).
 * En producción (Vercel), usar @upstash/redis en lugar de este cliente.
 */

import { createClient } from "redis";

let _client: ReturnType<typeof createClient> | null = null;

export async function getRedis() {
  if (!_client) {
    _client = createClient({
      url: import.meta.env.REDIS_URL ?? "redis://localhost:6379",
    });
    _client.on("error", (err) => console.error("Redis error:", err));
    await _client.connect();
  }
  return _client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = await getRedis();
    const value = await client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null; // degradar gracefully si Redis no está disponible
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300
): Promise<void> {
  try {
    const client = await getRedis();
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // degradar gracefully
  }
}

export function notebookCacheKey(slug: string): string {
  return `epauta:notebooks:${slug}`;
}

export function sourcesCacheKey(notebookId: string): string {
  return `epauta:sources:${notebookId}`;
}
```

**Nota sobre Vercel (serverless):** En producción con Vercel, las funciones serverless no mantienen conexiones TCP persistentes entre invocaciones. Reemplazar el cliente `redis` por `@upstash/redis` que usa HTTP:

```typescript
// Para Vercel en producción:
import { Redis } from "@upstash/redis";
const redis = new Redis({
  url: import.meta.env.UPSTASH_REDIS_REST_URL,
  token: import.meta.env.UPSTASH_REDIS_REST_TOKEN,
});
```

**Agregar dependencias en `package.json`:**

```json
{
  "dependencies": {
    "redis": "^4.6.0"
  }
}
```

O para Vercel: `"@upstash/redis": "^1.x.x"`

---

### Paso 2.4 — Crear el mapeo ramo → notebook_id

El archivo `notebook_mapping.json` generado por el script de bootstrap en open-notebook debe copiarse al repo de ePAUTA. Se guarda en `src/data/notebook_mapping.json` y se versiona, ya que es configuración estable.

**Nuevo archivo: `src/data/notebook_mapping.json`** (generado por el script, luego versionado)

```json
{
  "calculo-1": "notebook:abc123",
  "algebra-lineal": "notebook:def456",
  "fisica-1": "notebook:ghi789"
}
```

**Nuevo archivo: `src/lib/ramos.ts`**

```typescript
import notebookMapping from "../data/notebook_mapping.json";

export function getNotebookId(ramo_slug: string): string | undefined {
  return (notebookMapping as Record<string, string>)[ramo_slug];
}

export function getAllRamoSlugs(): string[] {
  return Object.keys(notebookMapping as Record<string, string>);
}
```

---

### Paso 2.5 — Refactorizar páginas de ramos para usar la API

Las páginas actuales de ePAUTA en `src/pages/` renderizan datos estáticos de `src/data/`. Deben refactorizarse para consultar open-notebook dinámicamente.

**Modificar `src/pages/[programa]/[ramo]/index.astro`** (o la ruta equivalente):

```astro
---
import { getNotebookId } from "../../../lib/ramos";
import { listSourcesByNotebook, getNotebook } from "../../../lib/open-notebook";
import { cacheGet, cacheSet, sourcesCacheKey, notebookCacheKey } from "../../../lib/redis";
import Layout from "../../../layouts/Layout.astro";
import RamoChat from "../../../components/RamoChat";
import FileViewer from "../../../components/FileViewer";

const { programa, ramo } = Astro.params;
const notebookId = getNotebookId(ramo!);

if (!notebookId) {
  return Astro.redirect("/404");
}

// Intentar desde caché primero
let sources = await cacheGet(sourcesCacheKey(notebookId));
if (!sources) {
  sources = await listSourcesByNotebook(notebookId);
  await cacheSet(sourcesCacheKey(notebookId), sources, 300);
}

let notebook = await cacheGet(notebookCacheKey(ramo!));
if (!notebook) {
  notebook = await getNotebook(notebookId);
  await cacheSet(notebookCacheKey(ramo!), notebook, 300);
}
---

<Layout title={notebook.name}>
  <div class="flex h-screen">
    <!-- Panel izquierdo: lista de fuentes / visor -->
    <div class="flex-1 overflow-auto">
      <h1 class="text-2xl font-bold p-4">{notebook.name}</h1>
      <FileViewer sources={sources} notebookId={notebookId} client:load />
    </div>
    <!-- Panel derecho: chat -->
    <div class="w-96 border-l flex flex-col">
      <RamoChat
        notebookId={notebookId}
        ramoNombre={notebook.name}
        client:load
      />
    </div>
  </div>
</Layout>
```

---

### Paso 2.6 — Crear el componente de chat por ramo

Este es el componente principal nuevo de ePAUTA: permite consultar al LLM sobre el contenido del ramo con streaming de respuestas.

**Nuevo archivo: `src/components/RamoChat.tsx`**

```tsx
import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RamoChatProps {
  notebookId: string;
  ramoNombre: string;
}

export default function RamoChat({ notebookId, ramoNombre }: RamoChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Crear sesión de chat al montar el componente
  useEffect(() => {
    fetch("/api/chat/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebookId }),
    })
      .then((r) => r.json())
      .then((data) => setSessionId(data.sessionId))
      .catch(console.error);
  }, [notebookId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !sessionId) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    // Llamar al endpoint SSE proxy de ePAUTA
    const response = await fetch("/api/chat/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: userMessage, notebookId }),
    });

    if (!response.body) {
      setLoading(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";

    // Agregar mensaje vacío del asistente que se irá llenando con el stream
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.content ?? parsed.delta ?? "";
            assistantContent += delta;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
              };
              return updated;
            });
          } catch {}
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-3 bg-gray-50 border-b font-semibold text-sm text-gray-700">
        Consultar sobre {ramoNombre}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-8">
            Hacé una pregunta sobre los apuntes del ramo
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3 text-sm text-gray-500 animate-pulse">
              Pensando...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="¿Tenés alguna duda sobre este ramo?"
          className="flex-1 border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading || !sessionId}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !sessionId || !input.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
```

---

### Paso 2.7 — Crear endpoints de API en ePAUTA (proxy hacia open-notebook)

Astro permite crear endpoints de servidor en `src/pages/api/`. Estos sirven como proxy para no exponer la URL del backend directamente al cliente, y también aplican la capa de caché Redis.

**Nuevo archivo: `src/pages/api/chat/create-session.ts`**

```typescript
import type { APIRoute } from "astro";
import { createChatSession } from "../../../lib/open-notebook";

export const POST: APIRoute = async ({ request }) => {
  const { notebookId } = await request.json();
  const session = await createChatSession(notebookId);
  return new Response(JSON.stringify({ sessionId: session.id }), {
    headers: { "Content-Type": "application/json" },
  });
};
```

**Nuevo archivo: `src/pages/api/chat/ask.ts`**

```typescript
import type { APIRoute } from "astro";
import { executeChatStream } from "../../../lib/open-notebook";

export const POST: APIRoute = async ({ request }) => {
  const { sessionId, message, notebookId } = await request.json();

  // Proxy directo del stream SSE desde open-notebook hacia el cliente
  const upstreamResponse = await executeChatStream(sessionId, message, notebookId);

  return new Response(upstreamResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
```

**Nuevo archivo: `src/pages/api/notebooks/[slug]/sources.ts`**

```typescript
import type { APIRoute } from "astro";
import { listSourcesByNotebook } from "../../../../lib/open-notebook";
import { cacheGet, cacheSet, sourcesCacheKey } from "../../../../lib/redis";
import { getNotebookId } from "../../../../lib/ramos";

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  const notebookId = getNotebookId(slug!);
  if (!notebookId) {
    return new Response("Not found", { status: 404 });
  }

  const cacheKey = sourcesCacheKey(notebookId);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  const sources = await listSourcesByNotebook(notebookId);
  await cacheSet(cacheKey, sources, 300);

  return new Response(JSON.stringify(sources), {
    headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
  });
};
```

**Nuevo archivo: `src/pages/api/search/ask.ts`**

```typescript
import type { APIRoute } from "astro";
import { askNotebookStream } from "../../../lib/open-notebook";

export const POST: APIRoute = async ({ request }) => {
  const { question, notebookId } = await request.json();
  const upstreamResponse = await askNotebookStream(question, notebookId);

  return new Response(upstreamResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
```

**Nuevo archivo: `src/pages/api/search/index.ts`** (búsqueda con caché)

```typescript
import type { APIRoute } from "astro";
import { searchInNotebook } from "../../../lib/open-notebook";
import { cacheGet, cacheSet } from "../../../lib/redis";

export const POST: APIRoute = async ({ request }) => {
  const { query, notebookId, mode = "semantic" } = await request.json();
  const cacheKey = `epauta:search:${notebookId}:${mode}:${Buffer.from(query).toString("base64")}`;

  const cached = await cacheGet(cacheKey);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  const results = await searchInNotebook(query, notebookId, mode);
  await cacheSet(cacheKey, results, 1800);

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
  });
};
```

---

### Paso 2.8 — Actualizar variables de entorno de ePAUTA

**Modificar `.env.example`:**

```env
# Cloudflare R2 (existente — mantener)
CLOUFLARE_TOKEN_VALUE=your_cloudflare_token_here
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=epauta
R2_PUBLIC_DOMAIN=https://yourdomain.com

# open-notebook backend (NUEVO)
OPEN_NOTEBOOK_API_URL=https://your-open-notebook-backend.com/api

# Redis (NUEVO)
# Desarrollo local:
REDIS_URL=redis://localhost:6379
# Producción en Vercel → usar Upstash:
# UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
# UPSTASH_REDIS_REST_TOKEN=your_token
```

**Variables a configurar en el dashboard de Vercel:**

- `OPEN_NOTEBOOK_API_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

---

### Paso 2.9 — Actualizar `astro.config.mjs` para SSR

ePAUTA necesita SSR habilitado para que los endpoints de API funcionen en Vercel como funciones serverless.

**Modificar `astro.config.mjs`:**

```javascript
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  integrations: [react(), tailwind()],
  output: "server",          // habilitar SSR completo
  adapter: vercel(),
});
```

Para páginas que deben seguir siendo estáticas (home, about, etc.), agregar al inicio del archivo `.astro`:

```astro
---
export const prerender = true;
---
```

**Instalar adaptador si no está:**

```bash
npm install @astrojs/vercel
```

---

### Paso 2.10 — Eliminar código y dependencias no utilizadas en ePAUTA

**Archivos a revisar y posiblemente eliminar:**

```
src/lib/storage.ts        ← revisar: si R2 ya solo se usa para URLs públicas
                            (no para listar archivos desde el frontend),
                            eliminar. open-notebook es quien descarga/sirve.
scripts/upload-r2.*       ← evaluar: la ingesta de PDFs puede migrar completamente
                            al script sync_r2_sources.py del backend.
```

**Dependencias en `package.json` a revisar:**

Si `@aws-sdk/client-s3` se usaba solo en `storage.ts` para listar archivos desde el frontend y esa lógica migra al backend, removerla.

**Limpiar `tailwind.config.mjs`:** Asegurarse que el path de purge no incluya los directorios de datos eliminados.

---

### Paso 2.11 — Actualizar documentación de ePAUTA

**Modificar `README.md`:**

Actualizar la sección de Tech Stack agregando:
- open-notebook (backend de IA)
- Redis / Upstash Redis (caché)

Actualizar la sección de variables de entorno.

Agregar sección de arquitectura explicando:
- ePAUTA es solo el visualizador
- open-notebook procesa PDFs y gestiona el conocimiento
- Cada ramo = 1 Notebook en open-notebook
- Redis cachea respuestas y contextos

Agregar sección de setup que incluya:
1. Levantar open-notebook
2. Ejecutar bootstrap de notebooks
3. Sincronizar fuentes desde R2
4. Copiar `notebook_mapping.json`
5. Configurar variables de entorno
6. Deploy en Vercel

---

## FASE 3 — Infraestructura y deployment

### Paso 3.1 — Deployment de open-notebook (backend)

Se recomienda deployar open-notebook en un servicio que soporte contenedores con estado persistente: Railway, Fly.io, Render, DigitalOcean App Platform, o un VPS propio. **No es apto para plataformas puramente serverless** ya que SurrealDB necesita almacenamiento persistente.

**`docker-compose.yml` final para producción:**

```yaml
version: "3.8"

services:
  surrealdb:
    image: surrealdb/surrealdb:v2
    command: start --log info --user root --pass root rocksdb:/mydata/mydatabase.db
    user: root
    volumes:
      - ./surreal_data:/mydata
    restart: always
    # No exponer puerto 8000 al exterior — solo acceso interno

  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    volumes:
      - ./redis_data:/data
    restart: always
    # No exponer puerto 6379 al exterior — solo acceso interno

  open_notebook:
    build: .   # usar el Dockerfile del fork sin frontend
    ports:
      - "5055:5055"   # exponer solo el API
    environment:
      - OPEN_NOTEBOOK_ENCRYPTION_KEY=${OPEN_NOTEBOOK_ENCRYPTION_KEY}
      - SURREAL_URL=ws://surrealdb:8000/rpc
      - SURREAL_USER=root
      - SURREAL_PASSWORD=root
      - SURREAL_NAMESPACE=open_notebook
      - SURREAL_DATABASE=open_notebook
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - REDIS_URL=redis://redis:6379
      - EPAUTA_ORIGIN=${EPAUTA_ORIGIN}
    volumes:
      - ./notebook_data:/app/data
    depends_on:
      - surrealdb
      - redis
    restart: always
```

---

### Paso 3.2 — Configurar reverse proxy con HTTPS

Usar Caddy (recomendado por su manejo automático de certificados TLS) o Nginx como reverse proxy delante del puerto 5055.

**Ejemplo con Caddy (`Caddyfile`):**

```
api.tu-dominio.com {
    reverse_proxy open_notebook:5055
}
```

Caddy obtiene y renueva certificados TLS automáticamente via Let's Encrypt.

---

### Paso 3.3 — Configuración de Vercel para ePAUTA

En el dashboard de Vercel → Settings → Environment Variables, configurar:

| Variable | Valor |
|---|---|
| `OPEN_NOTEBOOK_API_URL` | `https://api.tu-dominio.com/api` |
| `UPSTASH_REDIS_REST_URL` | URL de Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Token de Upstash Redis |
| `R2_ENDPOINT` | (existente) |
| `R2_ACCESS_KEY_ID` | (existente) |
| `R2_SECRET_ACCESS_KEY` | (existente) |
| `R2_BUCKET_NAME` | (existente) |
| `R2_PUBLIC_DOMAIN` | (existente) |

---

### Paso 3.4 — Ejecutar scripts de inicialización en orden

Con el backend corriendo y la API key de Google configurada:

```bash
# 1. Sincronizar modelos de Google en open-notebook
curl -X POST https://api.tu-dominio.com/api/models/sync/google

# 2. Asignar modelos por defecto automáticamente
curl -X POST https://api.tu-dominio.com/api/models/auto-assign

# 3. Crear notebooks por ramo (ejecutar desde el repo de open-notebook)
OPEN_NOTEBOOK_API=https://api.tu-dominio.com/api \
  python scripts/bootstrap_epauta_notebooks.py

# 4. Sincronizar fuentes desde Cloudflare R2
OPEN_NOTEBOOK_API=https://api.tu-dominio.com/api \
R2_ENDPOINT=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
R2_PUBLIC_DOMAIN=... \
  python scripts/sync_r2_sources.py --mapping scripts/notebook_mapping.json

# 5. Copiar el mapeo al repo de ePAUTA
cp scripts/notebook_mapping.json ../epauta/src/data/notebook_mapping.json

# 6. Commit y redeploy de ePAUTA
cd ../epauta
git add src/data/notebook_mapping.json
git commit -m "feat: agregar mapeo notebook_id por ramo"
git push  # Vercel redeploy automático
```

---

### Paso 3.5 — Verificar la pipeline completa

Checklist de validación:

- [ ] `GET /api/notebooks` retorna los notebooks de los ramos
- [ ] `GET /api/sources?notebook_id=X` retorna las fuentes (PDFs) de un ramo
- [ ] `GET /api/sources/{id}/download` sirve el PDF desde R2
- [ ] `POST /api/search/ask/simple` retorna una respuesta RAG coherente
- [ ] `POST /api/chat/execute` hace streaming SSE correctamente
- [ ] Redis muestra hits de caché en llamadas repetidas (`X-Cache: HIT`)
- [ ] ePAUTA en Vercel carga la página de un ramo con sus fuentes
- [ ] El componente `RamoChat` envía mensajes y recibe respuestas streaming
- [ ] La búsqueda semántica devuelve resultados relevantes

---

## FASE 4 — Funcionalidades avanzadas (post-base funcional)

### Paso 4.1 — Búsqueda semántica cross-ramo en ePAUTA

Agregar un componente de búsqueda global que permita buscar en todos los notebooks a la vez, sin filtrar por `notebook_id`.

El componente llama a `POST /api/search` sin `notebook_id` y agrupa los resultados por ramo usando el `notebook_mapping.json` (invertido: `notebook_id → slug`).

**Nuevo archivo: `src/components/GlobalSearch.tsx`** — input de búsqueda que llama a `POST /api/search/index.ts`, muestra resultados agrupados por programa/ramo con links a la fuente.

---

### Paso 4.2 — Panel PDF + Chat integrado

Modificar el componente `PDFViewer.jsx` existente para incorporar el chat como panel lateral. El usuario visualiza el PDF y puede preguntar sobre su contenido simultáneamente.

Layout:
- 65% ancho: `PDFViewer` existente (sin cambios funcionales)
- 35% ancho: `RamoChat` panel

El contexto del chat ya incluye el PDF procesado por open-notebook como fuente del notebook, por lo que el LLM puede responder sobre el contenido del documento visible.

---

### Paso 4.3 — Generación de resúmenes automáticos por fuente

Usar el endpoint `POST /sources/{id}/insights` de open-notebook para generar un resumen ejecutivo de cada PDF al momento en que termina su procesamiento.

**Flujo completo:**
1. PDF existe en R2 → `sync_r2_sources.py` crea la Source
2. open-notebook procesa el PDF: extrae texto, genera embeddings
3. Una vez el status del job es `completed`, llamar `POST /sources/{id}/insights` con una transformación de "Resumen ejecutivo en español"
4. El insight generado se muestra en la card de cada fuente en ePAUTA

**Endpoint de open-notebook a usar:** `POST /sources/{id}/insights` con `transformation_id` de una transformación preconfigurada de tipo resumen.

---

### Paso 4.4 — Notas de estudio generadas por IA

Exponer la funcionalidad de notas de open-notebook en ePAUTA como una sección de "Notas de estudio" por ramo.

- Listar notas existentes: `GET /api/notes?notebook_id=X`
- Generar nota nueva con IA: `POST /api/notes` con `note_type: "ai"` y un prompt como "Genera un resumen de los conceptos clave de este ramo"
- El usuario puede ver y copiar las notas generadas

---

## Resumen de cambios por repositorio

### open-notebook — cambios

| Área | Acción |
|---|---|
| `frontend/` | Eliminar completamente |
| `Dockerfile.single` | Eliminar |
| `supervisord.single.conf` | Eliminar |
| `supervisord.conf` | Remover arranque del frontend Next.js |
| `Dockerfile` | Remover pasos de build del frontend |
| `docker-compose.yml` | Eliminar servicio frontend; agregar servicio Redis |
| `pyproject.toml` | Limpiar deps de providers no Google; agregar `redis>=5.0` |
| `.env.example` | Simplificar a variables Google + Redis + EPAUTA_ORIGIN |
| `run_api.py` / app FastAPI | Agregar middleware CORS para dominio ePAUTA |
| `open_notebook/cache/redis_client.py` | Crear — cliente Redis async |
| `open_notebook/cache/invalidation.py` | Crear — lógica de invalidación por entidad |
| `api/routers/notebooks.py` | Agregar caché en endpoint `/context` |
| `api/routers/search.py` | Agregar caché en endpoints `/ask/simple` y `/search` |
| Providers config | Hardcodear Google como proveedor por defecto |
| `scripts/bootstrap_epauta_notebooks.py` | Crear nuevo |
| `scripts/sync_r2_sources.py` | Crear nuevo |
| `README.md` / `CLAUDE.md` | Actualizar para reflejar arquitectura ePAUTA |

### ePAUTA — cambios

| Área | Acción |
|---|---|
| `src/data/plan-comun/` etc. | Eliminar datos estáticos de cursos |
| `src/data/notebook_mapping.json` | Crear (generado por script, versionado) |
| `src/lib/open-notebook.ts` | Crear — cliente tipado de la API |
| `src/lib/redis.ts` | Crear — caché SSR (con variante Upstash para Vercel) |
| `src/lib/ramos.ts` | Crear — mapeo slug → notebook_id |
| `src/lib/storage.ts` | Evaluar eliminación si R2 ya no se consulta desde frontend |
| `src/components/RamoChat.tsx` | Crear — chat con streaming SSE |
| `src/pages/api/chat/create-session.ts` | Crear — proxy POST |
| `src/pages/api/chat/ask.ts` | Crear — proxy SSE stream |
| `src/pages/api/notebooks/[slug]/sources.ts` | Crear — GET con caché |
| `src/pages/api/search/ask.ts` | Crear — proxy SSE stream RAG |
| `src/pages/api/search/index.ts` | Crear — POST búsqueda con caché |
| `src/pages/[programa]/[ramo]/index.astro` | Refactorizar para API dinámica |
| `astro.config.mjs` | Habilitar `output: "server"` + adaptador Vercel |
| `package.json` | Agregar `redis` o `@upstash/redis` |
| `.env.example` | Agregar `OPEN_NOTEBOOK_API_URL`, `REDIS_URL` |
| `README.md` | Actualizar arquitectura, setup y docs |

---

## Orden de ejecución recomendado (secuencial)

1. Fase 1, Paso 1.1 — Eliminar frontend de open-notebook
2. Fase 1, Paso 1.2 — Configurar Google AI Studio como único proveedor
3. Fase 1, Paso 1.3 — Implementar Redis en open-notebook (módulo + docker-compose)
4. Fase 1, Paso 1.4 — Configurar CORS en la API de open-notebook
5. Fase 1, Paso 1.5 — Crear script bootstrap de notebooks
6. Fase 1, Paso 1.6 — Crear script de sync de fuentes desde R2
7. Fase 1, Paso 1.7 — Actualizar docs de open-notebook
8. Fase 2, Paso 2.1 — Eliminar datos estáticos de ePAUTA
9. Fase 2, Paso 2.2 — Crear cliente open-notebook en ePAUTA
10. Fase 2, Paso 2.3 — Crear cliente Redis en ePAUTA
11. Fase 2, Paso 2.4 — Crear notebook_mapping.json y lib/ramos.ts
12. Fase 2, Paso 2.5 — Refactorizar páginas de ramos para usar API dinámica
13. Fase 2, Paso 2.6 — Crear componente RamoChat con streaming
14. Fase 2, Paso 2.7 — Crear endpoints API proxy en ePAUTA
15. Fase 2, Paso 2.8 — Actualizar variables de entorno en ePAUTA
16. Fase 2, Paso 2.9 — Habilitar SSR en Astro con adaptador Vercel
17. Fase 2, Paso 2.10 — Limpiar dependencias no usadas en ePAUTA
18. Fase 2, Paso 2.11 — Actualizar documentación de ePAUTA
19. Fase 3, Paso 3.1 — Deploy de open-notebook en VPS/cloud con Docker
20. Fase 3, Paso 3.2 — Configurar reverse proxy con HTTPS (Caddy/Nginx)
21. Fase 3, Paso 3.3 — Configurar variables de entorno en Vercel
22. Fase 3, Paso 3.4 — Ejecutar scripts de inicialización (modelos, notebooks, sync R2)
23. Fase 3, Paso 3.5 — Verificar pipeline completa con checklist
24. Fase 4, Pasos 4.1–4.4 — Funcionalidades avanzadas (post-base funcional)
