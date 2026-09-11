from fastapi import APIRouter
from app.schemas.title import TitleAnalyzeRequest, TitleAnalyzeResponse
from app.services.title_service import TitleService

router = APIRouter(prefix="/title", tags=["Title Intelligence"])

@router.post("/analyze", response_model=TitleAnalyzeResponse)
async def analyze_title(payload: TitleAnalyzeRequest):
    return await TitleService.analyze_title(payload)
