<!-- last_verified: 2026-08-07 -->
# Feature: Slide Manifest

## Purpose
`slides/<id>/manifest.json` is the per-slide source of truth on B2 — it carries the lifecycle status, tiling/encoder parameters, the MIL bag label, slide-level annotations, and pointers to every derived artifact.

## Used By
- UI: everything on `/slides` and `/slides/[id]` (the manifest is what the API serves)
- API: read by `GET /slides` / `GET /slides/{id}`; written by every lifecycle verb
- Job: rewritten on each status transition during extraction

## Core Functions
- `service.slides.persist` — write the manifest (`put_object` of the model JSON)
- `service.slides.get_slide` / `list_slides` — read one / scan all manifests
- `types.slides.Slide` / `SlideSummary` — the (de)serialization contract

## Canonical Files
- Pattern exemplar: `services/api/app/types/slides.py`

## Inputs
- Slide lifecycle events (ingest, register, extract, edit)

## Outputs
- `slides/<id>/manifest.json` containing: `id`, `label`, `source`, `status`, `stage` (coarse in-flight extraction stage while `extracting`; null on terminal status), `bag_label`, `encoder`, `patch_level`, `patch_size`, timestamps, `source_filename`/`size_bytes`, geometry (`width`/`height`/`level_count`/`mpp`), `notes`, artifact keys (`source_key`, `embeddings_key`, `thumbnail_key`, `tissue_overlay_key`, `patch_grid_key`), `num_patches`, `feature_dim`, and the `extraction` result.

## Flow
- Every write goes through `persist`; the Library lists slides by scanning `slides/*/manifest.json`; the detail view reads one manifest.

## Edge Cases
- Unreadable/corrupt manifest → skipped in the Library scan (logged), not fatal.
- Edit updates only `label` / `bag_label` / `notes`; pipeline fields are never hand-edited.

## UX States (if applicable)
- The manifest is downloadable from the slide detail "Artifacts on B2" card.

## Verification
- Test files: `services/api/tests/test_slides.py`
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: list + stats read manifests correctly; edit round-trips `bag_label`/`notes`.

## Related Docs
- [MIL Bag Labels](mil-bag-labels.md)
- [Slide Ingest](slide-ingest.md)
