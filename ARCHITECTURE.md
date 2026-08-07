<!-- last_verified: 2026-08-06 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Slide Library (`/slides`) + Ingest (`/slides/new`) + slide detail/edit
  - Cohort dashboard (slide/patch counts, raw-vs-derived storage fan-out)
  - Full-bucket File Explorer (`/files`) and generic Upload (`/upload`)
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - Slide lifecycle: ingest (sample fetch or presigned upload), CLAM-style
    tissue segmentation + patch tiling (OpenSlide), CNN feature extraction
    (truncated ResNet50), edit, delete (prefix-scoped)
  - B2 S3 integration via boto3 (raw slides, patches, embedding bags, previews)
  - Health check endpoint with B2 connectivity verification
  - Structured JSON logging with request tracing; Prometheus-format metrics
- **packages/shared/** — TypeScript type definitions
  - Mirrors Pydantic models from the API (Slide, SlideStats, encoders, …)
  - Consumed by `apps/web/` as workspace dependency

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Authored Python files under `services/api/app/` stay under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (FileMetadata, Slide, SlideStats, …)
    config/                Settings loaded from environment
    repo/                  B2 S3 client + object/prefix I/O (data access layer)
    service/               Business logic: slides, tiling, features, extraction,
                           rendering, files, upload (heavy ML imports are LAZY)
    runtime/               FastAPI route handlers (slides, files, upload, …)
  tests/                   pytest tests (structural + integration)
```

The WSI pipeline keeps every heavy import (openslide, torch, torchvision,
scikit-image, numpy) inside functions in `service/tiling.py`,
`service/features.py`, and `service/rendering.py`, so importing the FastAPI app
and collecting tests never loads the scientific stack. `service/extraction.py`
composes tiling + features + repo writes and depends one-way on
`service/slides.py` (which owns the `manifest.json` read/write helpers).

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. The listing cache also owns the only background thread in the app: a stale entry is served immediately while that thread re-scans (stale-while-revalidate), and `main.lifespan` warms it once at startup so no user pays for the cold full-bucket scan.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repository: `web` builds from the
  repository root because it consumes `packages/shared`; `api` builds from
  `services/api`. The versioned per-service configs and the human-approved
  staging/production contract live in [infra/railway/README.md](infra/railway/README.md).
- **Vercel** — one project using [Vercel Services](https://vercel.com/docs/services):
  the `web` (Next.js) and `api` (FastAPI) services build from the same repo and
  share one origin — the web app at `/`, the API under `/api`. The repo-root
  `vercel.json` declares both services and routes `/api/*` to the API service;
  the Vercel-only `services/api/index.py` strips the `/api` prefix so FastAPI
  keeps its native paths (`/health`, `/files`, …). Uploads go directly from the
  browser to B2 via a presigned PUT (see
  [Slide Ingest](docs/features/slide-ingest.md)), so they bypass the Function's
  4.5 MB payload ceiling entirely — the bucket must allow the deploy origin in
  its CORS. A two-separate-Projects alternative and the full delivery contract
  live in [infra/vercel/README.md](infra/vercel/README.md).

External provisioning and deployment remain explicit user-approved actions.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API)
  - All uploaded files stored in a single bucket
  - File listing and metadata via S3 `list_objects_v2` / `head_object`
  - No application database — B2 is the sole data store

## External Services

- **Backblaze B2 S3 API** — file storage, retrieval, deletion, presigned URLs

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

## Data Flows

- **Ingest (sample)**: Browser -> `POST /slides` (source=sample) -> API fetches the OpenSlide test slide, `put_object`s it under `slides/<id>/source/`, renders a thumbnail, writes `manifest.json` -> response (status `registered`)
- **Ingest (own WSI)**: Browser -> `POST /slides` (source=upload) -> API validates + persists a pending manifest and signs a PUT -> Browser PUTs the slide **directly to B2** -> `POST /slides/{id}/register` (API HEADs the object + renders the thumbnail) -> response
- **Extract**: Browser -> `POST /slides/{id}/extract` -> service opens the slide (OpenSlide), tissue-segments a thumbnail, tiles a patch grid, `put_object`s each patch PNG, embeds patches with the truncated ResNet50, writes `features/embeddings.pt` + previews, updates the manifest -> response (status `extracted`)
- **Read**: Browser -> `GET /slides` / `GET /slides/{id}` -> service scans/reads `manifest.json` -> returns summaries/full manifest
- **Asset**: Browser -> `GET /slides/{id}/asset/{name}` -> repo generates a presigned URL (inline preview or attachment download)
- **Delete**: Browser -> `DELETE /slides/{id}` -> service `delete_prefix("slides/<id>/")` — SCOPED, never bucket-wide
- **Files (kept)**: the generic upload (`/upload/presign` + `/upload/verify`) and full-bucket list/download/delete flows are retained unchanged

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## API Contract

- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export/check command: `pnpm contract:export` / `pnpm contract:check`
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The frontend client keeps a small `API_CLIENT_ROUTES` registry in
`apps/web/src/lib/api-client.ts`. Tests compare that registry to the checked-in
OpenAPI artifact so route changes fail loudly before the hand-written client can
silently drift from FastAPI. `GET /metrics` is intentionally server-only.

## Canonical Files

- Slide routes (runtime): `services/api/app/runtime/slides.py`
- Slide CRUD + ingest orchestration: `services/api/app/service/slides.py`
- Tiling + tissue segmentation (OpenSlide): `services/api/app/service/tiling.py`
- Feature extraction (torch ResNet50): `services/api/app/service/features.py`
- Extraction pipeline (composition): `services/api/app/service/extraction.py`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`, `repo/b2_object.py`
- Pydantic models: `services/api/app/types/` (`slides.py`, `files.py`, `upload.py`, …)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI contract: `docs/api/openapi.json`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Slide Ingest](docs/features/slide-ingest.md)
- [Tissue Segmentation](docs/features/tissue-segmentation.md)
- [Feature Extraction](docs/features/feature-extraction.md)
- [Slide Manifest](docs/features/slide-manifest.md)
- [MIL Bag Labels](docs/features/mil-bag-labels.md)
- [Derived Fan-out](docs/features/derived-fanout.md)
- [Dashboard](docs/features/dashboard.md)
- [File Browser](docs/features/file-browser.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
