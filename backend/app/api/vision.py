from fastapi import APIRouter
from app.schemas.vision import VisionAnalyzeRequest, VisionAnalyzeResponse
from app.services.vision_service import VisionService

router = APIRouter(prefix="/vision", tags=["Vision AI"])

@router.post("/analyze", response_model=VisionAnalyzeResponse)
def analyze_vision(payload: VisionAnalyzeRequest):
    return VisionService.analyze_vision(payload)
