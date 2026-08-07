<!-- last_verified: 2026-08-07 -->
# App Workflows

User journeys inside the application. The primary flow is the **Slide** lifecycle;
the generic Upload and File Explorer are the kept starter surfaces.

## Ingest a Slide

- User navigates to `/slides/new`
- Chooses a **Slide source** (RadioGroup): **Sample slide (CMU-1-Small-Region)** (default) or **Upload my own WSI**
- Sets finite options via Selects: **MIL bag label** (default `unknown`), **patch level** (default 0), **patch size** (default 256), **feature encoder** (ResNet50 truncated). Label and notes are free text; **Label** is pre-filled from the source (`CMU-1-Small-Region` for the sample, the uploaded filename stem for an upload) and stays editable, so the golden path needs no typing
- **Sample**: submitting fetches the ~1.9 MB test slide server-side, lands it under `slides/<id>/source/`, renders a thumbnail, and navigates to the slide — status `registered`
- **Upload**: submitting mints a presigned PUT; the browser streams the slide **directly to B2** (a multi-GB slide never passes through the API), then the app finalizes with a register call — status `registered`
- Safe defaults are surfaced as guidance text; the only field pre-filled with an editable value is **Label** (derived from the source), so no separate autofill button is needed
- See: [Slide Ingest](features/slide-ingest.md)

## Run Feature Extraction

- On `/slides/[id]`, the user clicks **Run extraction**
- OpenSlide opens the slide, tissue is segmented, a patch grid is tiled and each patch is written to B2, the truncated ResNet50 embeds every patch, and a `[N_patches, 1024]` `embeddings.pt` + previews + manifest are written back
- Status flows `registered → extracting → extracted` (or `failed`); the page polls and updates itself, and the in-progress alert shows an advancing stage stepper (Tiling → Embedding → Finalizing) driven by the manifest's persisted `stage`. The status badge reads "Extracting" for the whole run
- The extraction stats card shows the device (auto-detected), patch count, embedding-bag shape, and tissue fraction
- See: [Feature Extraction](features/feature-extraction.md)

## Browse the Slide Library

- User navigates to `/slides` — a grid of slide cards (thumbnail, bag label, patch count, status), scoped to the `slides/` prefix
- Opening a card shows the detail view: preview tabs (thumbnail / tissue mask / patch grid), details, extraction stats, and downloadable artifacts (embedding bag, manifest)
- This Library is distinct from the full-bucket File Explorer at `/files`
- See: [Slide Manifest](features/slide-manifest.md)

## Edit or Delete a Slide

- **Edit** (`/slides/[id]/edit`): the form opens pre-filled from the manifest; the user updates the label, MIL bag label, or notes, and the change is written back into `manifest.json`
- **Delete**: a confirmation dialog deletes the slide and every derived artifact, scoped strictly to `slides/<id>/` — never bucket-wide
- See: [MIL Bag Labels](features/mil-bag-labels.md)

## View Dashboard

- User navigates to `/` (home)
- Cohort stat cards show slides, extracted count, total patches, and objects on B2
- The storage fan-out panel splits raw WSI bytes from derived (patch + embedding) bytes — the write-amplification story
- The recent-slides table links each slide to its detail page
- See: [Dashboard](features/dashboard.md)

## Upload Files (kept starter surface)

- User navigates to `/upload`, drops or selects files
- Files upload **directly from the browser to B2** via a presigned PUT; a determinate bar tracks the bytes, then an indeterminate "Verifying upload..." phase while the API HEADs and magic-byte-sniffs the stored object
- On success: toast + "View in Files"; the queue survives navigation
- This generic path is retained from the starter for arbitrary files; slides use the Ingest flow above
- See: [File Browser](features/file-browser.md)

## Browse and Manage Files (kept starter surface)

- User navigates to `/files` — the full-bucket tree view (every object, including `slides/<id>/…`)
- Click a file row to preview; the per-row actions menu (preview / download / delete) is always visible
- Arriving at `/files?preview=<key>` expands that file's folders and opens its preview
- See: [File Browser](features/file-browser.md)

## Change Preferences

- User navigates to `/settings`
- A banner states the page is mostly a demonstration: only **Theme** is wired up for real; the profile/notification/quota fields persist to `localStorage` only
- The WSI pipeline itself is configured via server-side env (`EXTRACT_DEVICE`, `MIL_BAG_LABELS`, …), not this page — see [Settings](features/settings.md)
