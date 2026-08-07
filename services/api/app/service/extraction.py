"""CLAM-style feature-extraction orchestration.

Split out of `service.slides` to keep both modules under the 300-line ceiling.
This is the ONLY place that composes the tiling + CNN pipeline with the repo
writes; it depends on `service.slides` for the manifest read/write helpers (a
one-way dependency, so there is no import cycle).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.repo import get_object_bytes, put_bytes
from app.service import features, rendering, slides, tiling
from app.types.slides import ExtractionResult, Slide, SlideStage

logger = logging.getLogger(__name__)

_PNG = "image/png"
_OCTET = "application/octet-stream"


def _advance(slide: Slide, stage: SlideStage) -> None:
    """Persist a coarse stage transition so the polling UI can advance."""
    slide.stage = stage
    slide.updated_at = datetime.now(UTC)
    slides.persist(slide)


def _write_patches(slide_id: str, result: tiling.TilingResult) -> None:
    for coord, patch in result.patches:
        key = (
            f"{slides.SLIDES_PREFIX}{slide_id}/patches/"
            f"patch_{coord.row:04d}_{coord.col:04d}.png"
        )
        put_bytes(key, rendering.patch_png(patch), _PNG)


def _write_previews(slide: Slide, result: tiling.TilingResult) -> None:
    base = f"{slides.SLIDES_PREFIX}{slide.id}/preview"
    put_bytes(f"{base}/thumbnail.png", rendering.thumbnail_png(result.thumbnail_rgb), _PNG)
    overlay = rendering.tissue_overlay_png(result.thumbnail_rgb, result.tissue_mask)
    grid = rendering.patch_grid_png(
        result.thumbnail_rgb,
        result.coords,
        result.thumb_scale,
        slide.patch_size,
        result.geometry.level_downsample,
    )
    put_bytes(f"{base}/tissue_overlay.png", overlay, _PNG)
    put_bytes(f"{base}/patch_grid.png", grid, _PNG)
    slide.thumbnail_key = f"{base}/thumbnail.png"
    slide.tissue_overlay_key = f"{base}/tissue_overlay.png"
    slide.patch_grid_key = f"{base}/patch_grid.png"


def run_extraction(slide_id: str) -> Slide:
    """Tile the slide, embed each patch, and persist patches + embedding bag."""
    slide = slides.get_slide(slide_id)
    if not slide.source_key:
        raise slides.SlideValidationError("Slide has no source to extract from")
    slide.status = "extracting"
    slide.stage = "tiling"
    slide.updated_at = datetime.now(UTC)
    slide.error = None
    slides.persist(slide)

    try:
        data = get_object_bytes(slide.source_key)
        result = tiling.tile_slide(data, slide.patch_level, slide.patch_size)
        _write_patches(slide_id, result)

        _advance(slide, "embedding")
        device = features.resolve_device()
        encoder, dim = features.load_encoder(slide.encoder, device)
        embeddings = features.embed_patches(
            [p for _, p in result.patches], encoder, device
        )
        embeddings_key = f"{slides.SLIDES_PREFIX}{slide_id}/features/embeddings.pt"
        put_bytes(embeddings_key, features.tensor_to_bytes(embeddings), _OCTET)

        _advance(slide, "finalizing")
        _write_previews(slide, result)
        slide.width = result.geometry.width
        slide.height = result.geometry.height
        slide.level_count = result.geometry.level_count
        slide.mpp = result.geometry.mpp
        slide.num_patches = len(result.patches)
        slide.feature_dim = dim
        slide.embeddings_key = embeddings_key
        slide.status = "extracted"
        slide.stage = None
        slide.updated_at = datetime.now(UTC)
        slide.extraction = ExtractionResult(
            encoder=slide.encoder,
            device=device,
            num_patches=len(result.patches),
            feature_dim=dim,
            patch_level=result.geometry.patch_level,
            patch_size=slide.patch_size,
            tissue_fraction=round(result.tissue_fraction, 4),
            embeddings_key=embeddings_key,
        )
        logger.info(
            "Extraction done: id=%s device=%s patches=%d dim=%d",
            slide_id, device, len(result.patches), dim,
        )
        return slides.persist(slide)
    except Exception as e:
        slide.status = "failed"
        slide.stage = None
        slide.error = str(e)
        slide.updated_at = datetime.now(UTC)
        slides.persist(slide)
        logger.exception("Extraction failed: id=%s", slide_id)
        raise slides.SlideProcessingError(str(e)) from e
