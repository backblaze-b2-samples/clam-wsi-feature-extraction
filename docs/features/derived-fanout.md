<!-- last_verified: 2026-08-07 -->
# Feature: Derived Fan-out

## Purpose
Explain — and measure — why one WSI explodes into many derived objects, and why Backblaze B2 is the right home for all three storage tiers (raw, patches, features).

## Used By
- UI: the Dashboard "Storage fan-out" panel and stat cards
- API: `GET /slides/stats`
- Job: none

## Core Functions
- `service.slides.get_slide_stats` — aggregates the `slides/` prefix into raw vs. derived bytes

## Canonical Files
- Pattern exemplar: `services/api/app/service/slides.py` (`get_slide_stats`)

## Inputs
- Every object under `slides/` (via `list_objects_v2`)

## Outputs
- `SlideStats`: `total_slides`, `extracted_slides`, `source_bytes`, `total_patches`, `patch_bytes`, `embedding_bytes`, `total_objects`, `total_size_bytes` (+ human strings)

## The write-amplification story
- One gigapixel slide (1–4 GB) tiles into **thousands** of patch PNGs at production settings, plus **one** embedding bag (`[N_patches, 1024]` float32 ≈ 4 KB/patch) and a handful of previews + a manifest.
- Derived data therefore dwarfs the raw input, and a cohort of hundreds of slides quickly reaches **terabytes** of derived objects.
- The demo intentionally uses the ~1.9 MB sample slide (dozens of patches) so the fan-out is visible in seconds without producing gigabytes.

## Why B2 for all three tiers
- Raw slides, patches, and feature tensors are all written through the **S3-compatible API** with one cached boto3 client — no separate database, no local multi-terabyte staging. B2's low storage/egress cost makes keeping the full derived cohort economical, and presigned URLs stream previews/artifacts without exposing credentials.

## Edge Cases
- Stats read live from the prefix (not the full-bucket cache) so they reflect a just-finished extraction immediately.

## UX States (if applicable)
- Empty: fan-out panel prompts to ingest + extract a slide.

## Verification
- Test files: `services/api/tests/test_slides.py` (`test_get_slide_stats_aggregates_fanout`)
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Pass criteria: source vs. patch vs. embedding byte tallies match the objects on B2.

## Related Docs
- [Dashboard](dashboard.md)
- [Feature Extraction](feature-extraction.md)
