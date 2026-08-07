<!-- last_verified: 2026-08-07 -->
# Feature: Slide Ingest

## Purpose
Register a whole-slide image (WSI) on B2 — either the bundled sample slide or a user's own gigapixel `.svs`/`.tiff` — so it can be tiled and feature-extracted.

## Used By
- UI: `/slides/new` (Ingest form), the `SlideCreateForm` component
- API: `POST /slides`, `POST /slides/{slide_id}/register`
- Job: none (server-side sample fetch is synchronous; extraction is a separate step)

## Core Functions
- `service.slides.create_slide` — sample fetch + land, or presign an own-WSI upload
- `service.slides.register_slide` — finalize an uploaded slide (HEAD + thumbnail)
- `repo.generate_presigned_upload` — presigned PUT for browser-direct upload

## Canonical Files
- Pattern exemplar: `services/api/app/service/slides.py`

## Inputs
- source: `"sample" | "upload"` (RadioGroup, default sample)
- label: string (free text)
- bag_label: string (Select from `MIL_BAG_LABELS`, default `unknown`)
- patch_level: 0|1|2 (Select), patch_size: 256|512 (Select), encoder: Select
- filename / content_type / size_bytes: only for `source="upload"`

## Outputs
- `slides/<id>/source/<filename>` — raw WSI on B2 (server-fetched sample, or browser-PUT upload)
- `slides/<id>/preview/thumbnail.png` — rendered on ingest
- `slides/<id>/manifest.json` — the slide record (status `registered`, or `pending_upload` until registered)
- For uploads: a `PresignedUpload` (URL + signed headers) returned to the browser

## Flow
- **Sample**: `POST /slides` → server fetches `CMU-1-Small-Region.svs` (≈1.9 MB) → `put_object` under `source/` → OpenSlide thumbnail → manifest (`registered`).
- **Upload**: `POST /slides` → validate + persist a pending manifest → return a presigned PUT → browser PUTs the slide directly to B2 → `POST /slides/{id}/register` → HEAD + thumbnail → manifest (`registered`).

## Edge Cases
- Unknown encoder / patch level / patch size / bag label → 400 with the valid set.
- Upload declared > `max_file_size` (5 GB) → 400 before any presign.
- Upload registered but the object is missing (never PUT) → 400 "Uploaded slide not found".

## UX States (if applicable)
- Empty: Library empty state links to Ingest.
- Loading: indeterminate progress alert ("Registering slide" / "Uploading slide").
- Error: toast with the API detail; the form stays filled.

## Verification
- Test files: `services/api/tests/test_slides.py`
- Required cases: sample validation errors, upload presign path, list, prefix-scoped delete
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: a sample-slide ingest lands a source object + thumbnail + manifest and the slide appears in the Library as `registered`.

## Related Docs
- [Feature Extraction](feature-extraction.md)
- [Slide Manifest](slide-manifest.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
