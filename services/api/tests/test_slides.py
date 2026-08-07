"""Hermetic tests for the Slide domain.

The repo boundary (B2 I/O) and the heavy pipeline (tiling/features) are mocked,
so these run without network, OpenSlide, or torch — matching conftest's
external-network ban.
"""

from __future__ import annotations

import json

import pytest

from app.service import slides as slides_service
from app.types.slides import SlideCreate


def _manifest_obj(slide_id: str) -> dict:
    return {"Key": f"slides/{slide_id}/manifest.json", "Size": 100}


def _sample_manifest(slide_id: str = "abc123def456") -> bytes:
    now = "2026-08-07T00:00:00+00:00"
    return json.dumps(
        {
            "id": slide_id,
            "label": "Test slide",
            "source": "sample",
            "status": "registered",
            "bag_label": "unknown",
            "encoder": "resnet50-truncated",
            "patch_level": 0,
            "patch_size": 256,
            "created_at": now,
            "updated_at": now,
            "source_filename": "CMU-1-Small-Region.svs",
            "size_bytes": 1900000,
            "size_human": "1.9 MB",
            "num_patches": 0,
            "feature_dim": 1024,
            "thumbnail_key": f"slides/{slide_id}/preview/thumbnail.png",
            "error": None,
            "notes": "",
            "source_key": f"slides/{slide_id}/source/CMU-1-Small-Region.svs",
            "manifest_key": f"slides/{slide_id}/manifest.json",
        }
    ).encode("utf-8")


def test_create_rejects_unknown_encoder():
    with pytest.raises(slides_service.SlideValidationError):
        slides_service.create_slide(
            SlideCreate(source="sample", label="x", encoder="nope")
        )


def test_create_rejects_bad_patch_level():
    with pytest.raises(slides_service.SlideValidationError):
        slides_service.create_slide(
            SlideCreate(source="sample", label="x", patch_level=7)
        )


def test_create_rejects_bad_bag_label():
    with pytest.raises(slides_service.SlideValidationError):
        slides_service.create_slide(
            SlideCreate(source="sample", label="x", bag_label="not-a-label")
        )


def test_upload_source_returns_presigned_put(monkeypatch):
    """The own-WSI path mints a presigned PUT and persists a pending manifest."""
    written: dict[str, bytes] = {}
    monkeypatch.setattr(
        slides_service, "put_bytes", lambda k, d, ct: written.__setitem__(k, d)
    )
    monkeypatch.setattr(
        slides_service,
        "generate_presigned_upload",
        lambda key, ct, size, expires: f"https://example/{key}",
    )
    created = slides_service.create_slide(
        SlideCreate(
            source="upload",
            label="My slide",
            filename="tumor.svs",
            content_type="application/octet-stream",
            size_bytes=1234,
        )
    )
    assert created.upload is not None
    assert created.slide.status == "pending_upload"
    assert created.slide.source_key.endswith("/source/tumor.svs")
    # Manifest was persisted under the slide's own prefix.
    assert any(k.endswith("/manifest.json") for k in written)


def test_list_slides_reads_manifests(monkeypatch):
    slide_id = "abc123def456"
    monkeypatch.setattr(
        slides_service, "list_prefix_objects", lambda prefix: [_manifest_obj(slide_id)]
    )
    monkeypatch.setattr(
        slides_service, "get_object_bytes", lambda key: _sample_manifest(slide_id)
    )
    summaries = slides_service.list_slides()
    assert len(summaries) == 1
    assert summaries[0].id == slide_id
    assert summaries[0].label == "Test slide"


def test_get_slide_stats_aggregates_fanout(monkeypatch):
    slide_id = "abc123def456"
    objects = [
        _manifest_obj(slide_id),
        {"Key": f"slides/{slide_id}/source/CMU-1-Small-Region.svs", "Size": 1900000},
        {"Key": f"slides/{slide_id}/patches/patch_0000_0000.png", "Size": 5000},
        {"Key": f"slides/{slide_id}/patches/patch_0000_0001.png", "Size": 5000},
        {"Key": f"slides/{slide_id}/features/embeddings.pt", "Size": 8192},
    ]
    monkeypatch.setattr(slides_service, "list_prefix_objects", lambda prefix: objects)
    monkeypatch.setattr(
        slides_service, "get_object_bytes", lambda key: _sample_manifest(slide_id)
    )
    stats = slides_service.get_slide_stats()
    assert stats.total_slides == 1
    assert stats.total_patches == 2
    assert stats.source_bytes == 1900000
    assert stats.embedding_bytes == 8192


async def test_slides_route_lists(client, monkeypatch):
    monkeypatch.setattr(slides_service, "list_prefix_objects", lambda prefix: [])
    resp = await client.get("/slides")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_delete_slide_is_prefix_scoped(client, monkeypatch):
    captured: dict[str, str] = {}

    def fake_delete_prefix(prefix: str) -> int:
        captured["prefix"] = prefix
        return 3

    monkeypatch.setattr(slides_service, "delete_prefix", fake_delete_prefix)
    resp = await client.delete("/slides/abc123def456")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True
    assert captured["prefix"] == "slides/abc123def456/"
