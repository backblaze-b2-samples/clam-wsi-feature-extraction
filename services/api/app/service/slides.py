"""Slide CRUD + CLAM-style feature-extraction orchestration over B2.

The `manifest.json` under `slides/<id>/` is the source of truth. This layer
validates input, writes source + derived artifacts to B2 under the slide's own
prefix, and is the ONLY place that composes repo I/O with the tiling / feature
pipeline. Heavy work is delegated to `service.tiling` and `service.features`
(lazy openslide/torch).
"""

from __future__ import annotations

import logging
import re
import urllib.request
import uuid
from datetime import UTC, datetime

from app.config import settings
from app.repo import (
    delete_prefix,
    generate_presigned_upload,
    get_file_metadata,
    get_object_bytes,
    get_presigned_url,
    list_prefix_objects,
    put_bytes,
)
from app.service import rendering, tiling
from app.service.upload import sanitize_filename
from app.types.formatting import humanize_bytes
from app.types.slides import (
    FEATURE_ENCODERS,
    PATCH_LEVELS,
    PATCH_SIZES,
    PresignedUpload,
    Slide,
    SlideCreate,
    SlideCreated,
    SlideStats,
    SlideSummary,
)

logger = logging.getLogger(__name__)

SLIDES_PREFIX = "slides/"
SAMPLE_FILENAME = "CMU-1-Small-Region.svs"
_ID_RE = re.compile(r"^[a-f0-9]{12,40}$")
_JSON = "application/json"
_PNG = "image/png"
_OCTET = "application/octet-stream"
_ASSET_KEYS = {
    "thumbnail": ("thumbnail_key", "inline"),
    "tissue_overlay": ("tissue_overlay_key", "inline"),
    "patch_grid": ("patch_grid_key", "inline"),
    "embeddings": ("embeddings_key", "attachment"),
}


class SlideValidationError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class SlideNotFoundError(Exception):
    def __init__(self, detail: str = "Slide not found"):
        self.detail = detail
        super().__init__(detail)


class SlideProcessingError(Exception):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


def _manifest_key(slide_id: str) -> str:
    return f"{SLIDES_PREFIX}{slide_id}/manifest.json"


def _validate_id(slide_id: str) -> None:
    if not _ID_RE.fullmatch(slide_id or ""):
        raise SlideNotFoundError()


def persist(slide: Slide) -> Slide:
    """Write the manifest. Public so service.extraction can persist run state."""
    put_bytes(_manifest_key(slide.id), slide.model_dump_json().encode("utf-8"), _JSON)
    return slide


def _validate_params(create: SlideCreate) -> None:
    if create.encoder not in FEATURE_ENCODERS:
        raise SlideValidationError(f"Unknown encoder. Choose one of {list(FEATURE_ENCODERS)}")
    if create.patch_level not in PATCH_LEVELS:
        raise SlideValidationError(f"patch_level must be one of {list(PATCH_LEVELS)}")
    if create.patch_size not in PATCH_SIZES:
        raise SlideValidationError(f"patch_size must be one of {list(PATCH_SIZES)}")
    if create.bag_label not in settings.bag_label_options:
        raise SlideValidationError(
            f"bag_label must be one of {settings.bag_label_options}"
        )


def _fetch_sample_slide() -> bytes:
    # Fixed https OpenSlide test-data URL (settings.sample_slide_url default).
    req = urllib.request.Request(
        settings.sample_slide_url,
        headers={"User-Agent": "b2ai-clam-wsi-feature-extraction"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def _new_slide(create: SlideCreate, slide_id: str, filename: str, now: datetime) -> Slide:
    return Slide(
        id=slide_id,
        label=create.label,
        source=create.source,
        status="pending_upload" if create.source == "upload" else "registered",
        bag_label=create.bag_label,
        encoder=create.encoder,
        patch_level=create.patch_level,
        patch_size=create.patch_size,
        created_at=now,
        updated_at=now,
        source_filename=filename,
        size_bytes=0,
        size_human=humanize_bytes(0),
        num_patches=0,
        feature_dim=FEATURE_ENCODERS[create.encoder].feature_dim,
        notes=create.notes,
        manifest_key=_manifest_key(slide_id),
    )


def _render_thumbnail(slide: Slide, data: bytes) -> None:
    """Open the slide, capture geometry, and write the thumbnail preview PNG."""
    with tiling.open_slide_from_bytes(data) as osr:
        geometry = tiling.slide_geometry(osr, slide.patch_level)
        thumb_rgb, _ = tiling.read_thumbnail(osr)
    thumb_key = f"{SLIDES_PREFIX}{slide.id}/preview/thumbnail.png"
    put_bytes(thumb_key, rendering.thumbnail_png(thumb_rgb), _PNG)
    slide.thumbnail_key = thumb_key
    slide.width = geometry.width
    slide.height = geometry.height
    slide.level_count = geometry.level_count
    slide.mpp = geometry.mpp


def create_slide(create: SlideCreate) -> SlideCreated:
    """Register a slide from the bundled sample or an own-WSI upload."""
    _validate_params(create)
    slide_id = uuid.uuid4().hex
    now = datetime.now(UTC)

    if create.source == "upload":
        if not create.filename or not create.content_type or not create.size_bytes:
            raise SlideValidationError(
                "Upload requires filename, content_type, and size_bytes"
            )
        if create.size_bytes > settings.max_file_size:
            raise SlideValidationError(
                f"Slide too large. Max: {humanize_bytes(settings.max_file_size)}"
            )
        safe_name = sanitize_filename(create.filename)
        source_key = f"{SLIDES_PREFIX}{slide_id}/source/{safe_name}"
        slide = _new_slide(create, slide_id, safe_name, now)
        slide.source_key = source_key
        slide.size_bytes = create.size_bytes
        slide.size_human = humanize_bytes(create.size_bytes)
        persist(slide)
        url = generate_presigned_upload(
            source_key, create.content_type, create.size_bytes,
            settings.presign_upload_expiry_seconds,
        )
        upload = PresignedUpload(
            key=source_key, url=url, method="PUT",
            content_type=create.content_type,
            headers={"Content-Type": create.content_type},
            expires_in=settings.presign_upload_expiry_seconds,
        )
        logger.info("Slide upload registered: id=%s key=%s", slide_id, source_key)
        return SlideCreated(slide=slide, upload=upload)

    # Sample slide: fetch server-side, land it in B2, render the thumbnail.
    data = _fetch_sample_slide()
    source_key = f"{SLIDES_PREFIX}{slide_id}/source/{SAMPLE_FILENAME}"
    put_bytes(source_key, data, _OCTET)
    slide = _new_slide(create, slide_id, SAMPLE_FILENAME, now)
    slide.source_key = source_key
    slide.size_bytes = len(data)
    slide.size_human = humanize_bytes(len(data))
    _render_thumbnail(slide, data)
    logger.info("Sample slide registered: id=%s bytes=%d", slide_id, len(data))
    return SlideCreated(slide=persist(slide), upload=None)


def register_slide(slide_id: str) -> Slide:
    """Finalize an own-WSI upload: confirm the object then render the thumbnail."""
    slide = get_slide(slide_id)
    if not slide.source_key:
        raise SlideValidationError("Slide has no source to register")
    metadata = get_file_metadata(slide.source_key)
    if not metadata:
        raise SlideValidationError("Uploaded slide not found in storage")
    slide.size_bytes = metadata.size_bytes
    slide.size_human = metadata.size_human
    data = get_object_bytes(slide.source_key)
    _render_thumbnail(slide, data)
    slide.status = "registered"
    slide.updated_at = datetime.now(UTC)
    logger.info("Slide registered: id=%s bytes=%d", slide_id, slide.size_bytes)
    return persist(slide)


def list_slides() -> list[SlideSummary]:
    summaries: list[SlideSummary] = []
    for obj in list_prefix_objects(SLIDES_PREFIX):
        if not obj["Key"].endswith("/manifest.json"):
            continue
        try:
            summaries.append(SlideSummary.model_validate_json(get_object_bytes(obj["Key"])))
        except Exception:
            logger.warning("Skipping unreadable manifest: %s", obj["Key"])
    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries


def get_slide(slide_id: str) -> Slide:
    _validate_id(slide_id)
    try:
        data = get_object_bytes(_manifest_key(slide_id))
    except RuntimeError as e:
        raise SlideNotFoundError() from e
    return Slide.model_validate_json(data)


def update_slide(
    slide_id: str, label: str | None, bag_label: str | None, notes: str | None
) -> Slide:
    slide = get_slide(slide_id)
    if label is not None:
        slide.label = label
    if bag_label is not None:
        if bag_label not in settings.bag_label_options:
            raise SlideValidationError(f"bag_label must be one of {settings.bag_label_options}")
        slide.bag_label = bag_label
    if notes is not None:
        slide.notes = notes
    slide.updated_at = datetime.now(UTC)
    return persist(slide)


def delete_slide(slide_id: str) -> None:
    """Delete every object under `slides/<id>/` — SCOPED, never bucket-wide."""
    _validate_id(slide_id)
    deleted = delete_prefix(f"{SLIDES_PREFIX}{slide_id}/")
    logger.info("Slide deleted: id=%s objects=%d", slide_id, deleted)


def get_asset_url(slide_id: str, name: str) -> str:
    slide = get_slide(slide_id)
    if name == "manifest":
        return get_presigned_url(slide.manifest_key, disposition="inline")
    if name not in _ASSET_KEYS:
        raise SlideValidationError(f"Unknown asset {name!r}")
    attr, disposition = _ASSET_KEYS[name]
    key = getattr(slide, attr)
    if not key:
        raise SlideNotFoundError(f"Asset {name!r} not available yet")
    return get_presigned_url(key, disposition=disposition)


def get_slide_stats() -> SlideStats:
    summaries = list_slides()
    objects = list_prefix_objects(SLIDES_PREFIX)
    source_bytes = sum(o["Size"] for o in objects if "/source/" in o["Key"])
    patch_objs = [o for o in objects if "/patches/" in o["Key"]]
    patch_bytes = sum(o["Size"] for o in patch_objs)
    embedding_bytes = sum(o["Size"] for o in objects if "/features/" in o["Key"])
    total_bytes = sum(o["Size"] for o in objects)
    return SlideStats(
        total_slides=len(summaries),
        extracted_slides=sum(1 for s in summaries if s.status == "extracted"),
        source_bytes=source_bytes,
        source_bytes_human=humanize_bytes(source_bytes),
        total_patches=len(patch_objs),
        patch_bytes=patch_bytes,
        patch_bytes_human=humanize_bytes(patch_bytes),
        embedding_bytes=embedding_bytes,
        embedding_bytes_human=humanize_bytes(embedding_bytes),
        total_objects=len(objects),
        total_size_bytes=total_bytes,
        total_size_human=humanize_bytes(total_bytes),
    )
