<!-- last_verified: 2026-08-07 -->
# Feature: Feature Extraction

## Purpose
Turn each tissue patch into a compact embedding and store one per-slide feature bag on B2 — the second half of the CLAM pipeline and the input a downstream MIL model consumes.

## Used By
- UI: "Run extraction" on `/slides/[id]`; the Feature-extraction stats card
- API: `POST /slides/{slide_id}/extract`
- Job: runs in Starlette's threadpool (long-running, off the event loop)

## Core Functions
- `service.features.resolve_device` — auto-detect CUDA → Apple MPS → CPU (CPU default)
- `service.features.load_encoder` — torchvision ResNet50 truncated after layer3 + adaptive avg pool (1024-d)
- `service.features.embed_patches` — batched, normalized inference → `[N_patches, 1024]`
- `service.extraction.run_extraction` — orchestration + status state machine + B2 writes

## Canonical Files
- Pattern exemplar: `services/api/app/service/features.py`, `services/api/app/service/extraction.py`

## Inputs
- Patch RGB arrays from `service.tiling.tile_slide`
- encoder key (default `resnet50-truncated`), `EXTRACT_DEVICE` (default `auto`)

## Outputs
- `slides/<id>/patches/patch_<row>_<col>.png` — every extracted patch on B2
- `slides/<id>/features/embeddings.pt` — a torch tensor `[N_patches, 1024]`
- `slides/<id>/preview/{thumbnail,tissue_overlay,patch_grid}.png`
- Manifest updated: status `extracted`, `num_patches`, `feature_dim`, and an `ExtractionResult` (device, tissue fraction, params)

## Flow
- `registered → extracting` (persisted) → tile → write patch PNGs → embed → write `embeddings.pt` → write previews → `extracted` (or `failed` with `error`).

## Edge Cases
- No GPU → runs on CPU (never asserts a GPU); MPS falls back to CPU where a torchvision op is unsupported.
- torch + numpy OpenMP clash on macOS → the API launch env sets `KMP_DUPLICATE_LIB_OK=TRUE`.
- Zero tissue patches → an empty `[0, 1024]` bag is written; status is still `extracted`.
- Encoder weights missing → downloaded once (~100 MB) to `services/api/.torch_cache` and cached.

## UX States (if applicable)
- Loading: "Feature extraction running" alert; the slide page polls until `extracted`/`failed`.
- Error: destructive alert with the failure detail; re-run is available.

## Verification
- Test files: `services/api/tests/test_slides.py`
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full`
- Pass criteria: on the sample slide, extraction writes patch PNGs + a `[N, 1024]` `.pt` bag and flips the slide to `extracted`.

## Related Docs
- [Tissue Segmentation](tissue-segmentation.md)
- [MIL Bag Labels](mil-bag-labels.md)
- [docs/SECURITY.md](../SECURITY.md)
