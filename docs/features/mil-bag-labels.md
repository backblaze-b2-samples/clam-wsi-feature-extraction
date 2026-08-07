<!-- last_verified: 2026-08-07 -->
# Feature: MIL Bag Labels

## Purpose
Store a weakly-supervised, slide-level label ("bag label") alongside each embedding bag, so the exported features are training-ready for a multiple-instance-learning (MIL) classifier — the paradigm CLAM targets.

## Used By
- UI: the "MIL bag label" Select on the Ingest and Edit forms; shown on the slide card/detail
- API: `POST /slides` (initial), `PATCH /slides/{id}` (edit)
- Job: none

## Core Functions
- `config.settings.bag_label_options` — parses `MIL_BAG_LABELS` into the finite option set
- `service.slides.create_slide` / `update_slide` — validate the label against that set

## Canonical Files
- Pattern exemplar: `services/api/app/service/slides.py`

## Inputs
- bag_label: one of `MIL_BAG_LABELS` (default `tumor,normal,unknown`), a Select — never free text

## Outputs
- `bag_label` field in `manifest.json` (stored next to `embeddings.pt`)

## Flow
- Weak supervision means the label is at the *slide* (bag) level, not per patch — the whole bag of patch embeddings shares one label. Set `unknown` at ingest, then edit it once the ground truth is known.

## Edge Cases
- A label outside `MIL_BAG_LABELS` → 400. A custom `MIL_BAG_LABELS` env is honored by the API; the Edit form also keeps the slide's current label selectable even if the env later changes.

## UX States (if applicable)
- Create: default hint is `unknown` (guidance text, no autofill).
- Edit: pre-filled from the manifest; no default hint.

## Verification
- Test files: `services/api/tests/test_slides.py` (`test_create_rejects_bad_bag_label`)
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: only allowed labels are accepted; edits persist to the manifest.

## Related Docs
- [Feature Extraction](feature-extraction.md)
- [Slide Manifest](slide-manifest.md)
