<!-- last_verified: 2026-08-07 -->
# Feature: Tissue Segmentation & Patch Tiling

## Purpose
Find the tissue on a gigapixel slide and tile a patch grid over it — the first half of the CLAM pipeline — so only informative regions are embedded.

## Used By
- UI: the slide detail "Tissue mask" and "Patch grid" previews (after extraction)
- API: invoked inside `POST /slides/{slide_id}/extract`
- Job: none (runs in Starlette's threadpool during an extraction request)

## Core Functions
- `service.tiling.open_slide_from_bytes` — stage bytes to a temp file, open with OpenSlide
- `service.tiling.read_thumbnail` — downsampled RGB thumbnail (longest edge ≤ 1024 px)
- `service.tiling.tissue_mask` — HSV + Otsu on the saturation channel, morphological clean-up
- `service.tiling.patch_grid` — grid over tissue regions above a coverage threshold
- `service.tiling.tile_slide` — full pass returning geometry, coords, and patch pixels

## Canonical Files
- Pattern exemplar: `services/api/app/service/tiling.py`

## Inputs
- WSI bytes (from `slides/<id>/source/`)
- patch_level (0/1/2, clamped to available pyramid levels), patch_size (256/512)

## Outputs
- Patch coordinates (level-0 (x, y) per kept tile) and per-patch RGB arrays
- `tissue_fraction` (mask coverage), slide geometry (dims, level count, microns/pixel)
- Feeds the tissue-overlay and patch-grid preview PNGs (see `service/rendering.py`)

## Flow
- Open the slide with OpenSlide; read a downsampled thumbnail.
- Convert to HSV, Otsu-threshold the saturation channel → binary tissue mask; close + de-speckle.
- Step a grid at `patch_size × level_downsample` over level-0; keep cells whose thumbnail region is ≥ 35% tissue (capped at 400 patches for demo tractability).
- Read each kept patch at `patch_level` via `read_region`.

## Edge Cases
- Blank/near-blank slide → Otsu falls back to a low floor; few or zero patches (extraction still succeeds with an empty bag).
- Requested `patch_level` beyond the pyramid → clamped to the coarsest available level.
- Huge uploaded slide → the 400-patch cap keeps a demo run bounded (raise it for production).

## UX States (if applicable)
- The overlay/patch-grid tabs are disabled until extraction has run.

## Verification
- Test files: `services/api/tests/test_slides.py` (pipeline is exercised end-to-end in dev; heavy libs are import-safe)
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full`
- Pass criteria: on the sample slide, tiling yields dozens of tissue patches and a non-zero `tissue_fraction`.

## Related Docs
- [Feature Extraction](feature-extraction.md)
- [Derived Fan-out](derived-fanout.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
