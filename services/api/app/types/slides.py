"""Domain models for whole-slide-image (WSI) Slides.

A Slide is one gigapixel pathology image plus its CLAM-style feature-extraction
lifecycle. The canonical record is the `manifest.json` stored in B2 under
`slides/<id>/`; these models are the (de)serialization contract for it and for
the HTTP API.

This module is import-safe: it pulls in no heavy scientific stack (torch,
openslide, scikit-image, numpy). Those live only inside functions in
`service/tiling.py` and `service/features.py`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Lifecycle states. `pending_upload` (own-WSI upload: manifest created, browser
# is PUTing bytes) -> `registered` (source landed + thumbnail rendered) ->
# `extracting` (tiling + CNN embedding running) -> `extracted` (patches +
# embedding bag + previews written) | `failed` (pipeline error; `error` explains).
SlideStatus = Literal[
    "pending_upload", "registered", "extracting", "extracted", "failed"
]

# Where the raw WSI comes from.
SlideSource = Literal["sample", "upload"]

# --- Finite, selectable feature encoders ----------------------------------
# The create/edit forms render this as a Select (finite options), never free
# text. Keep in sync with packages/shared/src/types.ts FEATURE_ENCODERS.


class EncoderInfo(BaseModel):
    key: str
    name: str
    feature_dim: int
    description: str


FEATURE_ENCODERS: dict[str, EncoderInfo] = {
    "resnet50-truncated": EncoderInfo(
        key="resnet50-truncated",
        name="ResNet50 (truncated, ImageNet)",
        feature_dim=1024,
        description="CLAM's default encoder — a torchvision ResNet50 truncated "
        "after layer3 with adaptive average pooling, giving a 1024-d patch "
        "embedding. CPU-friendly; weights auto-downloaded once.",
    ),
}

DEFAULT_ENCODER = "resnet50-truncated"

# Selectable tiling parameters (finite Selects in the form).
PATCH_LEVELS = (0, 1, 2)
PATCH_SIZES = (256, 512)
DEFAULT_PATCH_LEVEL = 0
DEFAULT_PATCH_SIZE = 256

# Preview PNG kinds rendered for the UI.
PreviewKind = Literal["thumbnail", "tissue_overlay", "patch_grid"]
# Downloadable derived artifacts (presigned GET).
AssetName = Literal["thumbnail", "tissue_overlay", "patch_grid", "embeddings", "manifest"]


class ExtractionResult(BaseModel):
    """Outcome of one feature-extraction run, embedded in the manifest."""

    encoder: str
    device: str
    num_patches: int
    feature_dim: int
    patch_level: int
    patch_size: int
    tissue_fraction: float
    embeddings_key: str


class SlideCreate(BaseModel):
    """Form fields for registering a slide.

    For `source="sample"` no file fields are needed. For `source="upload"` the
    declared `filename`/`content_type`/`size_bytes` let the API mint a presigned
    PUT so the browser streams the (multi-GB) slide straight to B2.
    """

    source: SlideSource = "sample"
    label: str = Field(min_length=1, max_length=120)
    bag_label: str = Field(default="unknown", max_length=60)
    patch_level: int = DEFAULT_PATCH_LEVEL
    patch_size: int = DEFAULT_PATCH_SIZE
    encoder: str = DEFAULT_ENCODER
    notes: str = Field(default="", max_length=2000)
    # Upload path only:
    filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None


class SlideUpdate(BaseModel):
    """Editable metadata. All optional; only provided fields change."""

    label: str | None = Field(default=None, min_length=1, max_length=120)
    bag_label: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=2000)


class SlideSummary(BaseModel):
    """Compact record for the Library grid (one per manifest.json)."""

    id: str
    label: str
    source: SlideSource
    status: SlideStatus
    bag_label: str
    encoder: str
    patch_level: int
    patch_size: int
    created_at: datetime
    updated_at: datetime
    source_filename: str
    size_bytes: int
    size_human: str
    num_patches: int
    feature_dim: int
    thumbnail_key: str | None = None
    error: str | None = None


class SlideStats(BaseModel):
    """Dashboard aggregates over the `slides/` prefix — the fan-out story."""

    total_slides: int
    extracted_slides: int
    # Source (raw WSI) bytes landed, separate from derived data.
    source_bytes: int
    source_bytes_human: str
    # Derived fan-out: extracted patch PNGs and their bytes.
    total_patches: int
    patch_bytes: int
    patch_bytes_human: str
    # Embedding bag bytes across every extracted slide.
    embedding_bytes: int
    embedding_bytes_human: str
    # Every object under slides/ — one WSI fans out into thousands of patches
    # plus one embedding bag plus previews plus the manifest.
    total_objects: int
    total_size_bytes: int
    total_size_human: str


class PresignedUpload(BaseModel):
    """A short-lived presigned PUT for a direct browser-to-B2 slide upload."""

    key: str
    url: str
    method: str
    content_type: str
    headers: dict[str, str]
    expires_in: int


class Slide(SlideSummary):
    """Full manifest — the source of truth persisted as `manifest.json`."""

    notes: str = ""
    source_key: str | None = None
    manifest_key: str = ""
    embeddings_key: str | None = None
    tissue_overlay_key: str | None = None
    patch_grid_key: str | None = None
    # Slide geometry (from OpenSlide), populated on register.
    width: int | None = None
    height: int | None = None
    level_count: int | None = None
    mpp: float | None = None
    extraction: ExtractionResult | None = None


class SlideCreated(BaseModel):
    """Response to POST /slides.

    `upload` is populated only for the own-WSI upload path: the browser PUTs the
    bytes to it, then calls POST /slides/<id>/register. It is never persisted.
    """

    slide: Slide
    upload: PresignedUpload | None = None
