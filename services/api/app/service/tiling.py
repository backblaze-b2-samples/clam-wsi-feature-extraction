"""OpenSlide read + CLAM-style tissue segmentation and patch tiling.

Implements the approach of CLAM's `create_patches_fp` (Lu et al., *Nature
Biomedical Engineering* 2021; github.com/mahmoodlab/CLAM) with permissive
dependencies — the GPL CLAM repo is NOT vendored. Tissue is segmented on a
downsampled thumbnail (HSV + Otsu on saturation), then a patch grid is tiled
over the tissue regions and each patch is read at the requested magnification
level via OpenSlide (openslide.org).

ALL heavy imports (openslide, numpy, skimage, PIL) are done LAZILY inside
functions so the FastAPI app and pytest collection load without them. Never
move these imports to module top level.
"""

from __future__ import annotations

import contextlib
import os
import tempfile
from dataclasses import dataclass, field

# The longest edge of the thumbnail used for tissue segmentation + previews.
THUMBNAIL_MAX_DIM = 1024
# Fraction of a grid cell that must be tissue for the patch to be kept.
TISSUE_COVERAGE_THRESHOLD = 0.35
# Hard cap so an accidentally huge slide can never explode into a runaway
# tiling job on the demo box. The small sample slide yields far fewer.
MAX_PATCHES = 400


@dataclass
class PatchCoord:
    col: int
    row: int
    x0: int  # level-0 x of the patch top-left
    y0: int  # level-0 y of the patch top-left


@dataclass
class SlideGeometry:
    width: int
    height: int
    level_count: int
    mpp: float | None
    patch_level: int
    level_downsample: float


@dataclass
class TilingResult:
    geometry: SlideGeometry
    coords: list[PatchCoord]
    tissue_fraction: float
    # Numpy arrays handed to service.rendering for preview PNGs.
    thumbnail_rgb: object = None
    tissue_mask: object = None
    thumb_scale: float = 1.0  # level-0 pixels per thumbnail pixel
    patches: list = field(default_factory=list)  # list[(PatchCoord, ndarray RGB)]


@contextlib.contextmanager
def open_slide_from_bytes(data: bytes):
    """Write WSI bytes to a temp file and open it with OpenSlide.

    OpenSlide needs a filesystem path (it memory-maps the pyramidal TIFF), so
    the bytes fetched from B2 are staged to a temp file for the duration of the
    read. The demo uses the ~1.9 MB sample slide; a multi-GB production slide
    should be streamed to disk rather than buffered — see docs.
    """
    import openslide

    fd, path = tempfile.mkstemp(suffix=".svs")
    os.close(fd)
    try:
        with open(path, "wb") as fh:
            fh.write(data)
        osr = openslide.OpenSlide(path)
        try:
            yield osr
        finally:
            osr.close()
    finally:
        with contextlib.suppress(OSError):
            os.unlink(path)


def read_thumbnail(osr, max_dim: int = THUMBNAIL_MAX_DIM):
    """Return (thumbnail_rgb ndarray, scale) where scale = level0_px / thumb_px."""
    import numpy as np

    w0, h0 = osr.dimensions
    longest = max(w0, h0)
    scale = max(1.0, longest / float(max_dim))
    thumb_w, thumb_h = round(w0 / scale), round(h0 / scale)
    thumb = osr.get_thumbnail((thumb_w, thumb_h)).convert("RGB")
    arr = np.asarray(thumb, dtype=np.uint8)
    # Recompute scale from the actual thumbnail size OpenSlide returned.
    actual_scale = w0 / float(arr.shape[1]) if arr.shape[1] else scale
    return arr, actual_scale


def tissue_mask(thumbnail_rgb):
    """CLAM-style tissue segmentation: Otsu on the HSV saturation channel."""
    import numpy as np
    from skimage.color import rgb2hsv
    from skimage.filters import threshold_otsu
    from skimage.morphology import binary_closing, disk, remove_small_objects

    hsv = rgb2hsv(thumbnail_rgb.astype(np.float32) / 255.0)
    saturation = hsv[:, :, 1]
    try:
        thresh = threshold_otsu(saturation)
    except ValueError:
        thresh = 0.0
    mask = saturation > max(thresh, 0.02)
    # Clean speckle and close small gaps so patch coverage is stable.
    mask = binary_closing(mask, disk(2))
    mask = remove_small_objects(mask, min_size=64)
    return mask


def slide_geometry(osr, patch_level: int) -> SlideGeometry:
    level_count = osr.level_count
    level = max(0, min(patch_level, level_count - 1))
    w0, h0 = osr.dimensions
    mpp = None
    with contextlib.suppress(Exception):
        mpp_x = osr.properties.get("openslide.mpp-x")
        if mpp_x:
            mpp = float(mpp_x)
    return SlideGeometry(
        width=int(w0),
        height=int(h0),
        level_count=int(level_count),
        mpp=mpp,
        patch_level=int(level),
        level_downsample=float(osr.level_downsamples[level]),
    )


def patch_grid(
    tissue,
    thumb_scale: float,
    geometry: SlideGeometry,
    patch_size: int,
    max_patches: int = MAX_PATCHES,
) -> tuple[list[PatchCoord], float]:
    """Tile a grid over tissue regions. Returns (coords, tissue_fraction)."""
    import numpy as np

    # One patch covers patch_size * level_downsample level-0 pixels.
    step0 = round(patch_size * geometry.level_downsample)
    step0 = max(step0, 1)
    coords: list[PatchCoord] = []
    th, tw = tissue.shape[:2]
    tissue_fraction = float(tissue.mean()) if tissue.size else 0.0

    n_cols = geometry.width // step0
    n_rows = geometry.height // step0
    for row in range(n_rows):
        for col in range(n_cols):
            x0, y0 = col * step0, row * step0
            # Map the level-0 patch box to thumbnail coords and test coverage.
            tx0 = int(x0 / thumb_scale)
            ty0 = int(y0 / thumb_scale)
            tx1 = min(tw, int((x0 + step0) / thumb_scale) + 1)
            ty1 = min(th, int((y0 + step0) / thumb_scale) + 1)
            if tx1 <= tx0 or ty1 <= ty0:
                continue
            cell = tissue[ty0:ty1, tx0:tx1]
            if cell.size and float(np.mean(cell)) >= TISSUE_COVERAGE_THRESHOLD:
                coords.append(PatchCoord(col=col, row=row, x0=x0, y0=y0))
                if len(coords) >= max_patches:
                    return coords, tissue_fraction
    return coords, tissue_fraction


def read_patch(osr, coord: PatchCoord, patch_level: int, patch_size: int):
    """Read one patch region at `patch_level` and return an RGB ndarray."""
    import numpy as np

    region = osr.read_region((coord.x0, coord.y0), patch_level, (patch_size, patch_size))
    return np.asarray(region.convert("RGB"), dtype=np.uint8)


def tile_slide(
    data: bytes, patch_level: int, patch_size: int, max_patches: int = MAX_PATCHES
) -> TilingResult:
    """Full tiling pass: thumbnail + tissue mask + patch grid + patch pixels."""
    with open_slide_from_bytes(data) as osr:
        geometry = slide_geometry(osr, patch_level)
        thumb_rgb, thumb_scale = read_thumbnail(osr)
        mask = tissue_mask(thumb_rgb)
        coords, tissue_fraction = patch_grid(
            mask, thumb_scale, geometry, patch_size, max_patches
        )
        patches = [
            (coord, read_patch(osr, coord, geometry.patch_level, patch_size))
            for coord in coords
        ]
    return TilingResult(
        geometry=geometry,
        coords=coords,
        tissue_fraction=tissue_fraction,
        thumbnail_rgb=thumb_rgb,
        tissue_mask=mask,
        thumb_scale=thumb_scale,
        patches=patches,
    )
