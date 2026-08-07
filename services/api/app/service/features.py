"""CNN feature extraction for WSI patches.

Implements CLAM's `extract_features_fp` encoder (Lu et al. 2021): a torchvision
ResNet50 truncated after the third residual block with adaptive average pooling,
producing a 1024-d embedding per patch. Runs on the auto-detected device
(CUDA -> Apple MPS -> CPU; CPU default), never hard-requiring a GPU.

ALL heavy imports (torch, torchvision, numpy) are done LAZILY inside functions
so the FastAPI app and pytest collection load without them. Never move these
imports to module top level.
"""

from __future__ import annotations

import io
import os

from app.config import settings
from app.types.slides import FEATURE_ENCODERS

# ImageNet normalization (what the pretrained ResNet50 expects).
_IMAGENET_MEAN = (0.485, 0.456, 0.406)
_IMAGENET_STD = (0.229, 0.224, 0.225)
_BATCH_SIZE = 32


def resolve_device(override: str | None = None) -> str:
    """Pick the inference device. Runtime auto-detect, never GPU-required.

    Preference order for `auto`: CUDA, then Apple MPS, then CPU. An explicit
    `cpu`/`cuda`/`mps` is honored but still falls back to CPU when unavailable,
    so this never hard-requires a GPU. Source: `override`, else EXTRACT_DEVICE.
    """
    import torch

    pref = (override or settings.extract_device or "auto").lower()

    def has_cuda() -> bool:
        return bool(torch.cuda.is_available())

    def has_mps() -> bool:
        backend = getattr(torch.backends, "mps", None)
        return bool(backend and backend.is_available())

    if pref == "cpu":
        return "cpu"
    if pref == "cuda":
        return "cuda" if has_cuda() else "cpu"
    if pref == "mps":
        return "mps" if has_mps() else "cpu"
    if has_cuda():
        return "cuda"
    if has_mps():
        return "mps"
    return "cpu"


def _configure_weights_cache() -> None:
    """Point torch's hub cache at the configured dir (weights download once)."""
    cache_dir = settings.extract_model_cache_dir
    if not cache_dir:
        api_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        cache_dir = os.path.join(api_root, ".torch_cache")
    os.makedirs(cache_dir, exist_ok=True)
    os.environ.setdefault("TORCH_HOME", cache_dir)


def load_encoder(encoder_key: str, device: str):
    """Build the truncated ResNet50 encoder on `device`. Returns (module, dim)."""
    import torch
    from torchvision.models import ResNet50_Weights, resnet50

    if encoder_key not in FEATURE_ENCODERS:
        raise ValueError(f"Unknown feature encoder: {encoder_key!r}")
    _configure_weights_cache()

    backbone = resnet50(weights=ResNet50_Weights.IMAGENET1K_V1)
    # CLAM truncates ResNet50 after layer3 (1024 channels) + global avg pool.
    encoder = torch.nn.Sequential(
        backbone.conv1,
        backbone.bn1,
        backbone.relu,
        backbone.maxpool,
        backbone.layer1,
        backbone.layer2,
        backbone.layer3,
        torch.nn.AdaptiveAvgPool2d((1, 1)),
    )
    encoder.eval().to(device)
    return encoder, FEATURE_ENCODERS[encoder_key].feature_dim


def _to_batch_tensor(patches, device):
    """Stack a list of HxWx3 uint8 RGB patch arrays into a normalized NCHW tensor."""
    import numpy as np
    import torch

    mean = torch.tensor(_IMAGENET_MEAN, device=device).view(1, 3, 1, 1)
    std = torch.tensor(_IMAGENET_STD, device=device).view(1, 3, 1, 1)
    stacked = np.stack(patches, axis=0).astype(np.float32) / 255.0
    tensor = torch.from_numpy(stacked).permute(0, 3, 1, 2).to(device)
    return (tensor - mean) / std


def embed_patches(patches: list, encoder, device: str):
    """Run the encoder over patch arrays and return a CPU tensor [N_patches, D]."""
    import torch

    if not patches:
        # Zero-patch slide: return an empty [0, D] tensor (D from the encoder's
        # final channel count) so downstream shape handling stays uniform.
        return torch.empty((0, 1024), dtype=torch.float32)

    features = []
    with torch.no_grad():
        for start in range(0, len(patches), _BATCH_SIZE):
            batch = patches[start : start + _BATCH_SIZE]
            out = encoder(_to_batch_tensor(batch, device))
            features.append(out.flatten(1).to("cpu"))
    return torch.cat(features, dim=0)


def tensor_to_bytes(tensor) -> bytes:
    """Serialize an embedding tensor to `.pt` bytes for storage on B2."""
    import torch

    buffer = io.BytesIO()
    torch.save(tensor, buffer)
    return buffer.getvalue()
