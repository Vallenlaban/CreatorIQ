from pydantic import BaseModel
from typing import List, Optional

class VisionAnalyzeRequest(BaseModel):
    image_url: Optional[str] = None

class VisionAnalyzeResponse(BaseModel):
    status: str
    detected_faces: int
    dominant_emotion: str
    clarity_score: float
    recommendations: List[str]
