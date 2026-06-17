# ePAUTA Notebooks

> Monorepo que integra **ePAUTA** (plataforma educativa) con **open-notebook** (backend de IA/RAG) para ofrecer visualización de recursos académicos y asistencia inteligente por ramo.

## 📖 Descripción

Este repositorio combina dos proyectos:

- **[`epauta/`](./epauta)** — Frontend en Astro + React que permite a estudiantes visualizar y descargar material académico organizado por programa y asignatura, con almacenamiento en Cloudflare R2.
- **[`open-notebook/`](./open-notebook)** — Backend de IA (FastAPI + SurrealDB) usado como motor de inteligencia: procesamiento de documentos, embeddings, búsqueda semántica y chat/RAG. Cada ramo universitario se mapea a un *Notebook*.

La integración entre ambos proyectos (arquitectura objetivo, fases de migración y configuración de proveedores LLM) está documentada en [`plan-accion-epauta-opennotebook.md`](./plan-accion-epauta-opennotebook.md).

## 🏗️ Arquitectura

```
┌─────────────────────────────┐
│         ePAUTA              │  Frontend Astro/React
│  (Astro + React + R2)       │  - Visualiza PDFs desde Cloudflare R2
│                              │  - Consultas RAG por ramo
└──────────┬───────────────────┘
           │ HTTP REST + SSE
           ▼
┌─────────────────────────────┐
│   open-notebook (API)       │  Backend Python/FastAPI
│   Puerto 5055               │  - Embeddings y búsqueda semántica
│                              │  - Chat / RAG / gestión de Notebooks
└──────────┬───────────────────┘
           │ SurrealQL
           ▼
┌─────────────────────────────┐
│        SurrealDB            │  Datos y vectores
└─────────────────────────────┘
```

## 🚀 Quickstart

### ePAUTA (frontend)

```bash
cd epauta
npm install
cp .env.example .env   # configura credenciales de Cloudflare R2
npm run dev            # http://localhost:4321
```

Más detalles en [`epauta/README.md`](./epauta/README.md).

### open-notebook (backend)

```bash
cd open-notebook
cp .env.example .env    # configura credenciales
docker-compose up
```

Más detalles en [`open-notebook/README.md`](./open-notebook/README.md).

## 📁 Estructura del repositorio

```
/
├── epauta/                          # Frontend (Astro + React + R2)
├── open-notebook/                   # Backend de IA (FastAPI + SurrealDB)
└── plan-accion-epauta-opennotebook.md  # Plan de integración entre ambos
```

