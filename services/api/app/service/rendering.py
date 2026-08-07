"""Render WSI preview PNGs: thumbnail, tissue-mask overlay, and patch grid.

Uses only numpy + Pillow. Every heavy import is done lazily inside a function so
the API and test collection stay import-safe without the scientific stack —
mirrors the tiling/features modules.
"""

from __future__ import annotations

import io

_TISSUE_TINT = (34, 197, 94)  # green overlay for segmented tissue
_PATCH_OUTLINE = (59, 130, 246)  # blue rectangles for sampled patches


def _png_bytes(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def thumbnail_png(thumbnail_rgb) -> bytes:
    """PNG of the downsampled slide thumbnail."""
    from PIL import Image

    return _png_bytes(Image.fromarray(thumbnail_rgb, mode="RGB"))


def tissue_overlay_png(thumbnail_rgb, tissue_mask, alpha: float = 0.4) -> bytes:
    """Thumbnail with the segmented tissue regions tinted."""
    import numpy as np
    from PIL import Image

    rgb = thumbnail_rgb.astype(np.float32)
    mask = np.asarray(tissue_mask, dtype=bool)
    tint = np.array(_TISSUE_TINT, dtype=np.float32)
    rgb[mask] = (1 - alpha) * rgb[mask] + alpha * tint
    out = np.clip(rgb, 0, 255).astype(np.uint8)
    return _png_bytes(Image.fromarray(out, mode="RGB"))


def patch_grid_png(
    thumbnail_rgb, coords, thumb_scale: float, patch_size: int, level_downsample: float
) -> bytes:
    """Thumbnail with a blue rectangle drawn over every sampled patch."""
    from PIL import Image, ImageDraw

    image = Image.fromarray(thumbnail_rgb, mode="RGB").convert("RGB")
    draw = ImageDraw.Draw(image)
    # A patch covers patch_size * level_downsample level-0 px; scale to thumbnail.
    box0 = patch_size * level_downsample
    box_t = max(1, round(box0 / thumb_scale))
    for coord in coords:
        tx = int(coord.x0 / thumb_scale)
        ty = int(coord.y0 / thumb_scale)
        draw.rectangle([tx, ty, tx + box_t, ty + box_t], outline=_PATCH_OUTLINE, width=1)
    return _png_bytes(image)


def patch_png(patch_rgb) -> bytes:
    """PNG of a single extracted patch (RGB ndarray)."""
    from PIL import Image

    return _png_bytes(Image.fromarray(patch_rgb, mode="RGB"))
