from fastapi import APIRouter
from app.schemas.thumbnail import ThumbnailGenerateRequest, ThumbnailGenerateResponse
from app.services.thumbnail_service import ThumbnailService

router = APIRouter(prefix="/thumbnail", tags=["Thumbnail Studio"])

@router.post("/generate", response_model=ThumbnailGenerateResponse)
async def generate_thumbnail(payload: ThumbnailGenerateRequest):
    return await ThumbnailService.generate_thumbnails(payload)
