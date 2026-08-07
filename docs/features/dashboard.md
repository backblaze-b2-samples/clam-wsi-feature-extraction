<!-- last_verified: 2026-08-07 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance overview of the WSI cohort and its derived-artifact fan-out on B2 — how many slides, how many extracted, how many patches, and how raw storage compares to derived storage.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /slides/stats`, `GET /slides`

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — 4 cohort stat cards (Slides, Extracted, Patches, Objects on B2)
- `apps/web/src/components/dashboard/cohort-fanout.tsx` — raw-vs-derived storage bars (the fan-out story)
- `apps/web/src/components/dashboard/recent-slides.tsx` — the 8 most recent slides
- `apps/web/src/lib/queries.ts` — `useSlideStats()`, `useSlides()`
- `services/api/app/runtime/slides.py` — `GET /slides/stats` handler
- `services/api/app/service/slides.py` — `get_slide_stats()` aggregation over the `slides/` prefix

## Canonical Files
- Dashboard layout: `apps/web/src/app/page.tsx`
- Stats service logic: `services/api/app/service/slides.py` (`get_slide_stats`)

## Inputs
- None (dashboard loads data automatically)

## Outputs
- `GET /slides/stats` → `SlideStats` (total_slides, extracted_slides, source_bytes, total_patches, patch_bytes, embedding_bytes, total_objects, total_size_bytes + human strings)
- `GET /slides` → `SlideSummary[]` for the recent-slides table (newest first; polls while any slide is `extracting`)

## Flow
- Page loads → two queries (slide stats + slide list).
- Stat cards show cohort counts; the fan-out panel splits `source_bytes` (raw WSIs) from derived bytes (patches + embeddings), making write-amplification visible.
- The recent-slides table lists the newest slides with patch count and status badge, each linking to its detail page.

## Edge Cases
- API unavailable → inline error state with retry (never a false zero).
- No slides → empty states on the cards, fan-out panel, and table.
- Stats read the `slides/` prefix live, so a just-finished extraction is reflected immediately.

## UX States
- Loading: skeletons on cards, fan-out bars, and table.
- Empty: "No slides yet" prompts to ingest.
- Loaded: populated cohort cards, fan-out bars, recent-slides table.

## Verification
- Test files: `services/api/tests/test_slides.py` (`test_get_slide_stats_aggregates_fanout`), `apps/web/src/lib/queries.test.ts`
- Required cases: stats aggregation (source/patch/embedding byte tallies), empty cohort, API error fallback
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Dev Workflows](../dev-workflows.md#commands) are available
- Pass criteria: focused tests and `pnpm verify` green.

## Related Docs
- [Derived Fan-out](derived-fanout.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
