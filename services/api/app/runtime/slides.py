"""Slide lifecycle HTTP routes.

Handlers stay thin: they translate service exceptions into HTTP status codes and
offload blocking work (B2 I/O, OpenSlide tiling, and the CNN feature pipeline)
to Starlette's threadpool so a slow extraction never stalls the event loop —
same rationale as `runtime/files.py`.
"""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.service.extraction import run_extraction
from app.service.slides import (
    SlideNotFoundError,
    SlideProcessingError,
    SlideValidationError,
    create_slide,
    delete_slide,
    get_asset_url,
    get_slide,
    get_slide_stats,
    list_slides,
    register_slide,
    update_slide,
)
from app.types.slides import (
    Slide,
    SlideCreate,
    SlideCreated,
    SlideStats,
    SlideSummary,
    SlideUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: these routes are intentionally UNAUTHENTICATED and single-tenant
# (see docs/SECURITY.md). Deletes are scoped to one slide's prefix, but there is
# no per-user isolation — a multi-tenant clone must add auth AND scope slides to
# the caller.


@router.get("/slides", response_model=list[SlideSummary])
def list_slides_endpoint():
    return list_slides()


@router.post("/slides", response_model=SlideCreated, status_code=201)
async def create_slide_endpoint(body: SlideCreate):
    try:
        return await run_in_threadpool(create_slide, body)
    except SlideValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Failed to register slide") from None


@router.get("/slides/stats", response_model=SlideStats)
def slide_stats_endpoint():
    return get_slide_stats()


@router.get("/slides/{slide_id}", response_model=Slide)
def get_slide_endpoint(slide_id: str):
    try:
        return get_slide(slide_id)
    except SlideNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.patch("/slides/{slide_id}", response_model=Slide)
def update_slide_endpoint(slide_id: str, body: SlideUpdate):
    try:
        return update_slide(
            slide_id, label=body.label, bag_label=body.bag_label, notes=body.notes
        )
    except SlideNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except SlideValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None


@router.delete("/slides/{slide_id}")
def delete_slide_endpoint(slide_id: str):
    try:
        delete_slide(slide_id)
    except SlideNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise HTTPException(status_code=502, detail="Failed to delete slide") from None
    return {"deleted": True, "id": slide_id}


@router.post("/slides/{slide_id}/register", response_model=Slide)
async def register_slide_endpoint(slide_id: str):
    try:
        return await run_in_threadpool(register_slide, slide_id)
    except SlideNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except SlideValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None


@router.post("/slides/{slide_id}/extract", response_model=Slide)
async def extract_slide_endpoint(slide_id: str):
    try:
        # Long-running (OpenSlide tiling + CNN inference): keep it off the loop.
        return await run_in_threadpool(run_extraction, slide_id)
    except SlideNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except SlideValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except SlideProcessingError as e:
        raise HTTPException(status_code=500, detail=e.detail) from None


@router.get("/slides/{slide_id}/asset/{name}")
def slide_asset_endpoint(slide_id: str, name: str):
    try:
        return {"url": get_asset_url(slide_id, name)}
    except SlideValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail) from None
    except SlideNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
