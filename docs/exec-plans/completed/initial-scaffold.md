# Build plan — `clam-wsi-feature-extraction`

Source of truth for the starter tree: `.claude/scratch/vcsk-d687ffbf-ef41-4ec7-82ad-bfc436b05d03/`
(cloned fresh in Phase 0). All keep/trim/add deltas below are computed against
that tree. Closest in-repo precedent — build against it, don't reinvent — is the
sibling `monai-dicom-segmentation` (heavy local ML + medical imaging + B2
derived-artifact fan-out, already on Standard #3 env vars). The builder should
mirror its shape (Study→Slide entity, Library-vs-File-Explorer split,
region-derived endpoint, device autodetect, selectable-model forms) rather than
invent a new structure.

---

## 1. Purpose

`clam-wsi-feature-extraction` is a computational-pathology sample that turns
Backblaze B2 into the storage layer for a whole-slide-image (WSI) feature-extraction
pipeline. A pathologist or ML engineer registers gigapixel WSIs (Aperio `.svs` /
TIFF, 1–4 GB each) that live in B2, and the app runs the **CLAM-style** pipeline —
OpenSlide reads the slide, tissue is segmented on a downsampled thumbnail, a patch
grid is tiled over tissue regions, and a CNN feature extractor produces a compact
per-slide embedding tensor (`.pt`). Raw slides, extracted patches, and embedding
tensors all live on B2; nothing multi-terabyte stays on local disk. The sample
demonstrates **large derived fan-out**: one 1–4 GB slide explodes into thousands of
patch images plus one embedding bag, so a modest cohort grows to terabytes of
derived data — and B2 absorbs all three tiers (raw, patches, features) through the
S3-compatible API. It is for digital-pathology labs and weakly-supervised MIL
researchers who want a runnable, cloud-native reference. Everything runs on local
OSS — **no second API key, B2 credentials only.**

---

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling. Strip what a WSI pipeline doesn't need; keep the
spine (UI kit, design tokens, file explorer, B2 repo layer, dev/setup scripts,
tests, CI).

### KEEP (as-is or near-as-is)
- **Full-bucket File Explorer** (`apps/web/src/app/files/*`, `components/files/*`,
  `services/api/app/{runtime,service}/files.py`) — **NON-NEGOTIABLE KEEP.** This is
  the raw whole-bucket browser and is never removable. It stays distinct from the
  sample-scoped **Slide Library** we add below.
- **UI kit** — all of `components/ui/*`, `globals.css` design tokens, the `/design`
  showcase (`app/design/*`, `components/design/*`). Do not trim.
- **Layout** — `components/layout/*` (sidebar, header, command palette, health
  banner, theme provider). Restate sidebar nav for the new pages; header already
  reads `APP_NAME` from `lib/app-config.ts` (rebrand in one file).
- **B2 repo layer** — `services/api/app/repo/{b2_client,b2_object,list_cache,counter}.py`.
  Keep the cached single-flight listing, health-check TTL, presigned-URL helper,
  and the boto3-confined-to-repo/ discipline. `b2_object.py` (`get_object_bytes` /
  `put_bytes` / `list_prefix_objects`) is exactly the on-demand read/write surface
  the pipeline needs.
- **Runtime spine** — `health.py`, `metrics.py` (request-id + timing + CORS-on-errors
  ordering), `ratelimit.py`. Keep the middleware ordering comment intact.
- **Upload path** — presigned-PUT-direct-to-browser (`runtime/upload.py`,
  `service/upload.py`, `components/upload/*`). Keep it for "upload your own WSI"
  (browser streams straight to B2, so a multi-GB slide never flows through the API).
  Adapt copy/limits (see ADD).
- **Dev/build harness** — `scripts/*` (setup.mjs, dev.sh, doctor.mjs, pick-port,
  python-runtime, local-bind, agent-docs), `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
  root `package.json` scripts, `.github/workflows/ci.yml`, `.pre-commit-config.yaml`,
  `vercel.json`, `infra/*`, test scaffolding (`tests/`, `e2e/`, `*.test.ts`).
- **Settings page + form** (`app/settings/*`, `components/settings/settings-form.tsx`,
  `danger-zone.tsx`) — keep as the in-repo exemplar for form UX (selectors + safe
  defaults). Adapt fields to the sample.
- **Agent docs spine** — `AGENTS.md`, `ARCHITECTURE.md`, `PRODUCT.md`, `CLAUDE.md`,
  `GEMINI.md` — keep, retarget content.

### TRIM (remove from starter)
- **`components/dashboard/upload-chart.tsx`** and the generic "uploads over time"
  framing — replace with slide/patch/embedding metrics (see ADD). Remove the chart
  only if it can't be restated; prefer restating it as a cohort-growth chart.
- **Generic metadata-extraction feature** as a standalone concept
  (`service/metadata.py` stays as a utility, but `docs/features/metadata-extraction.md`
  is repurposed — see §5).
- Nothing else is removed. The starter is lean; the delta is mostly *add* + *retarget*.

### ADD (new for clam-wsi-feature-extraction)
- **Primary entity = `Slide`** and its full lifecycle (see §4). New pages:
  - `/slides` — **Slide Library**: the sample-scoped asset explorer (lists only the
    app's own `slides/` prefix). This is the mandatory sample-specific explorer that
    complements — never replaces — the full-bucket `/files` explorer.
  - `/slides/new` — **Ingest** form (create).
  - `/slides/[id]` — **Slide detail**: thumbnail + tissue-mask overlay, patch-grid
    preview, embedding status/shape, artifact downloads, edit + delete + re-run.
- **Backend pipeline modules** (mirror monai's shape):
  - `services/api/app/service/slides.py` — slide CRUD + lifecycle/status state machine.
  - `services/api/app/service/tiling.py` — OpenSlide read + CLAM-style tissue
    segmentation (Otsu/HSV on a downsampled thumbnail) + patch-coordinate grid.
  - `services/api/app/service/features.py` — CNN feature extraction (device
    autodetect) → per-slide `[N_patches, C]` embedding tensor.
  - `services/api/app/service/rendering.py` — thumbnail + tissue-overlay + patch-grid
    preview images.
  - `services/api/app/runtime/slides.py` — slide routes (list/get/create/edit/delete/run).
  - `services/api/app/types/slides.py` — Pydantic models (Slide, SlideStatus,
    IngestRequest, RunRequest, embedding manifest).
- **B2 key scheme** (all under one app prefix, delete is prefix-scoped):
  - `slides/<id>/source/<filename>` — raw WSI (primary raw asset)
  - `slides/<id>/patches/patch_<row>_<col>.png` — extracted patches (the fan-out)
  - `slides/<id>/features/embeddings.pt` — feature bag tensor
  - `slides/<id>/manifest.json` — patch coords, params, MIL bag label, slide-level
    annotations (the structured JSON alongside embeddings)
  - `slides/<id>/preview/{thumbnail,tissue_overlay,patch_grid}.png` — UI previews
- **Demo data path** — no gigabyte binary is committed. A seed script / ingest option
  fetches OpenSlide's small freely-redistributable test slide
  (`CMU-1-Small-Region.svs`, ~1.9 MB Aperio SVS from the OpenSlide test-data set) so
  the demo tiles/extracts in seconds on CPU. Docs explain the real gigapixel
  production math. The Ingest form's "sample slide" option uses this.
- **Feature env** in settings + `.env.example`: `EXTRACT_DEVICE=auto` (CUDA→MPS→CPU),
  `MIL_BAG_LABELS` (comma list, default `tumor,normal,unknown`), optional
  `EXTRACT_MODEL_CACHE_DIR` (torchvision weights cache, gitignored default).

**Bucket-explorer tension note:** none. `/files` (full bucket) and `/slides`
(app-scoped Library) coexist exactly as in monai; the mandatory keep is satisfied
with no conflict.

---

## 3. B2 surface (S3-compatible only — no b2-native)

All operations go through the boto3 S3 client in `repo/b2_client.py` /
`repo/b2_object.py`, with `user_agent_extra="b2ai-clam-wsi-feature-extraction"`:

| Operation | S3 call | Where |
|-----------|---------|-------|
| Upload raw WSI (own file) | presigned `put_object` (browser-direct) | `runtime/upload.py` |
| Upload raw WSI (sample slide) | server-side `put_object` after fetch | `service/slides.py` |
| Write patches (fan-out) | `put_object` × N | `service/tiling.py` → `repo/b2_object.put_bytes` |
| Write embedding `.pt` + manifest | `put_object` | `service/features.py` |
| Write preview images | `put_object` | `service/rendering.py` |
| List slides / library / stats | `list_objects_v2` (paginated, cached) | `repo/b2_client`, `list_cache` |
| Read slide bytes for tiling | `get_object` | `repo/b2_object.get_object_bytes` |
| Head / detail | `head_object` | `repo/b2_client` |
| Stream previews & artifact download | `generate_presigned_url` (GET) | `repo/b2_client` |
| Delete slide (prefix-scoped) | `list_objects_v2` + `delete_object` under `slides/<id>/` | `service/slides.py` |
| Health | `head_bucket` | `repo/b2_client.check_connectivity` |

**No b2-native API anywhere.** Custom user agent set on the single cached client.
Standard `B2_*` env names, endpoint derived from `B2_REGION` (monai pattern).

---

## 4. Key features (seed README + `docs/features/*` stubs)

Primary entity: **Slide.** DEFAULT is the UI exposes ALL lifecycle verbs; all five
are genuinely user-accessible here, so **all are built — `omitted_ui_verbs` is empty.**

1. **Ingest a slide (CREATE)** — `/slides/new`. Register the bundled sample slide or
   upload your own `.svs`/`.tiff`/`.tif`. Lands raw WSI in B2 under
   `slides/<id>/source/`. Status → `registered`.
   - `deployment: local` (server-side fetch/relay only; no external provider).
2. **Run feature extraction (RUN)** — "Run extraction" on the slide page. OpenSlide
   opens the slide, tissue is segmented, a patch grid is tiled and written to B2, the
   CNN extracts per-patch features, and one `[N_patches, C]` embedding `.pt` + manifest
   are written back. Status: `registered` → `extracting` → `extracted` (or `failed`).
   - **External API provider: NONE.** Fully local OSS. `deployment: local`, so it
     inherits the CPU-default / GPU-autodetect hard rule (auto-detect CUDA → MPS →
     CPU via `EXTRACT_DEVICE`). Cost for a full demo run: **$0** (B2 storage only).
     Feature encoder: torchvision **ResNet50 truncated** (CLAM's default encoder,
     1024-d), weights auto-downloaded once and cached.
3. **Slide Library (READ)** — `/slides` list + `/slides/[id]` detail. App-scoped
   explorer over `slides/`; detail shows thumbnail, tissue overlay, patch-grid
   preview, patch count, embedding shape, downloadable artifacts.
4. **Edit slide metadata (EDIT)** — edit label, **MIL bag label**, and free-text
   notes; opens pre-filled. Bag label is core to the weakly-supervised MIL workflow
   ("slide-level annotations and bag labels stored alongside embeddings"), so edit is
   user-accessible and built. Writes back to `manifest.json`.
5. **Delete slide (DELETE)** — removes the slide and **all** derived artifacts,
   scoped strictly to `slides/<id>/` (never bucket-wide).
6. **Cohort dashboard** — restated dashboard: slide count, total patches, total
   embedding bytes, raw-vs-derived storage split (the fan-out story), recent slides.

**No Genblaze.** The description says "Runs on local OSS — no second API key" and
its Suggested/Trending stack is OpenSlide + CLAM only — no `genblaze-*` mention — so
provider calls are NOT routed through Genblaze. There are no external providers to
orchestrate.

### Form UX conventions (create/edit forms)
Follow `components/settings/settings-form.tsx` (selectors + safe defaults).

- **Ingest (create) form** — finite-value fields use selectors, never free text:
  - *Slide source* — `RadioGroup`/`Select`: **Sample slide (CMU-1-Small-Region)** |
    Upload my own WSI. Default: Sample slide.
  - *MIL bag label* — `Select` from `MIL_BAG_LABELS` (default `tumor` / `normal` /
    `unknown`). Default hint: `unknown`.
  - *Patch level (magnification)* — `Select` (0 = highest res, 1, 2 as available).
    Default hint: 0.
  - *Patch size* — `Select` (256 default, 512).
  - *Feature encoder* — `Select` (resnet50-truncated default) if >1 offered.
  - Free-text only for: *label* (slide display name) and *notes*.
  - CREATE safe defaults surfaced as placeholder / `FormDescription` guidance (sample
    slide, `unknown` bag label, level 0, patch 256) — guidance text only, **no
    autofill button**.
- **Edit form** — same selectors; opens pre-filled from the slide's real
  manifest values (no default hints — it edits a real resource).

---

## 5. Doc transforms (`docs/features/*`)

- **Rewrite** `dashboard.md` → cohort/fan-out metrics.
- **Rewrite** `file-browser.md` → full-bucket explorer; note it is the raw-bucket
  view, distinct from the `/slides` Library.
- **Rewrite** `settings.md` → new env (device, bag labels, cache dir).
- **Repurpose/replace** `file-upload.md` → `slide-ingest.md` (register/upload WSIs).
- **Repurpose/replace** `metadata-extraction.md` → `slide-manifest.md` (manifest.json:
  coords, params, bag label, slide-level annotations).
- **Add** `tissue-segmentation.md` (CLAM-style Otsu tiling), `feature-extraction.md`
  (CNN encoder, device autodetect, `.pt` bag tensor), `mil-bag-labels.md`
  (weakly-supervised MIL labels), `derived-fanout.md` (the write-amplification
  analog: 1 gigapixel slide → thousands of patches + one embedding; cohort → TB math,
  and why B2 is the storage layer for all three tiers).
- Keep `_template.md`.

README section order (humans first, per house style): title + one-line value →
"What it looks like" (screenshot placeholders) → Quick Start / CTA → the Slide
lifecycle → local ML & device selection → get a test slide → building-on-this-kit →
Core Features → Tech Stack → Commands → Deployment → **FAQ** (add one — high AEO
value; seed with the three "what people search for" queries) → Documentation Map →
License. Governance/SLA/legal stays low. Weave the three search phrases
("whole slide image storage B2 S3 pathology", "CLAM feature extraction object storage
bucket", "OpenSlide WSI dataset cloud storage pipeline") into the title/first
paragraph and FAQ.

---

## 6. Rename table (`vibe-coding-starter-kit` → `clam-wsi-feature-extraction`)

| Identifier | From | To |
|-----------|------|-----|
| Repo/dir (kebab) | `vibe-coding-starter-kit` | `clam-wsi-feature-extraction` |
| Root `package.json` name | `vibe-coding-starter-kit` | `clam-wsi-feature-extraction` |
| Web pkg name | `@vibe-coding-starter-kit/web` | `@clam-wsi-feature-extraction/web` |
| Shared pkg name | `@vibe-coding-starter-kit/shared` | `@clam-wsi-feature-extraction/shared` |
| Title Case (UI/docs) | "Vibe Coding Starter Kit" | "CLAM WSI Feature Extraction" |
| `app-config.ts` `APP_NAME` | "Vibe Coding Starter Kit" | "CLAM WSI Feature Extraction" |
| `app-config.ts` `APP_DESCRIPTION` | file-mgmt template | "Whole-slide-image feature extraction on Backblaze B2 — tile, segment, and embed gigapixel pathology slides." |
| `main.py` `API_TITLE` / description | Vibe Coding Starter Kit API | CLAM WSI Feature Extraction API |
| `user_agent_extra` | `b2ai-oss-start` | `b2ai-clam-wsi-feature-extraction` |
| UTM `utm_content` (all backblaze.com links, sidebar + README) | `b2ai-oss-start` (or none) | `b2ai-clam-wsi-feature-extraction` |
| snake_case (Python modules/ids) | n/a | `clam_wsi_feature_extraction` where a Python identifier is needed |
| CI workflow / infra names referencing the app | starter name | `clam-wsi-feature-extraction` |
| README H1 + docs headings | starter title | CLAM WSI Feature Extraction |

**Env-var standardization (starter deviation → Standard #3):** the starter ships
`B2_KEY_ID` / `B2_ENDPOINT` / `B2_PUBLIC_URL`. Refactor to the parent-CLAUDE.md
Standard #3 exactly, mirroring monai: `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`,
`B2_BUCKET_NAME`, `B2_REGION` (endpoint derived as a `b2_endpoint` property —
`https://s3.<region>.backblazeb2.com`), `B2_PUBLIC_URL_BASE` (optional). Update
`settings.py`, `main.py` startup validation, `b2_client.py`, `.env.example`, and all
docs. This is required — a strict reviewer flags the starter names as a Standard #3
defect.

---

## 7. Build risks / hard constraints for the builder (verify must pass on macOS arm64, CPU, no GPU)

These are the false-green traps for this sample class — bake the fixes in up front:

1. **OpenSlide native library.** `openslide-python` needs the OpenSlide C lib.
   Prefer the **`openslide-bin`** PyPI wheel (bundles the native lib, has macOS
   arm64 + linux wheels) so `pnpm run setup` doesn't require `brew install openslide`.
   Pin it. Document the brew/apt fallback in README + doctor check. This is the #1
   install risk.
2. **Pin ML deps with upper bounds** (unpinned torch/torchvision is a false green —
   boots + tests pass, marquee extraction breaks on a clean install). Pin
   `torch>=2.4,<2.9`, `torchvision` to the matching range, `openslide-bin`,
   `Pillow`, `scikit-image` (for tissue mask) with bounds, `numpy>=1.26,<2.0`
   (torch/torchvision/scikit-image compatibility). Keep `requirements.txt` (lower
   bounds) and `requirements.lock` (exact) in sync like monai; the dependency-lock
   regression test must pass.
3. **Set `KMP_DUPLICATE_LIB_OK=TRUE`** in the API launch env (torch + numpy/OpenMP
   duplicate-libomp abort class on macOS) — safe default, documented.
4. **Demo tractability.** Default the demo to the ~1.9 MB `CMU-1-Small-Region.svs`
   so tile+extract on CPU is seconds, producing dozens of patches (not thousands).
   The ResNet50 weights download once (~100 MB) and cache. Docs state the gigapixel
   production reality separately — this is honest, not misleading.
5. **Large-upload path.** Keep presigned-PUT-direct-to-browser for "upload your own"
   so multi-GB slides never buffer through the API. Raise `max_file_size` for WSIs
   (e.g. 5 GB) and document S3 multipart as the production upload path; the demo uses
   the small sample slide, so no multipart is needed to pass verify.
6. **CLAM licensing / vendoring.** Do NOT vendor the GPL `mahmoodlab/CLAM` research
   repo. Implement CLAM's *approach* (`create_patches_fp` tissue-seg+tiling and
   `extract_features_fp` CNN embedding) in-repo with permissive deps, and credit CLAM
   + OpenSlide as the methodology/tooling references in README + feature docs. Record
   this as an explicit, justified deviation.
7. **Long-running extraction UX.** Extraction is multi-second even on the small
   slide; use the same live `processing`→`done` status pattern monai uses (status
   persisted in `manifest.json`, slide page polls). Don't block the request thread
   forever; a background task or a synchronous-but-bounded run is fine for the demo.
8. **File-size / structure ceilings.** Respect the starter's per-file line ceilings
   enforced by `tests/test_structure.py` (keep boto3 confined to `repo/`, split
   modules like monai did). Run `pnpm lint`, `pnpm build`, and the Python tests
   before declaring done (a timed-out build silently skips theming/frontend wiring —
   confirm lint+build actually pass).

---

## 8. Out of scope (stay lean)
- One entity only (**Slide**), CRUD + run. No cohort/experiment/MIL-training-run
  entities in the UI (MIL training is described in docs as the downstream consumer of
  the embeddings, not built).
- No auth, no multi-tenant, no real gigapixel bundled asset, no actual MIL model
  training. The sample stops at "embeddings on B2, ready for MIL."
