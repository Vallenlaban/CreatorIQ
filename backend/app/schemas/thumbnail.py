from pydantic import BaseModel, Field
from typing import List, Optional

class ThumbnailItem(BaseModel):
    id: str  # "A", "B", "C"
    image_url: str
    ctr_score: int
    concept: Optional[str] = None
    badge: Optional[str] = None

class ThumbnailGenerateRequest(BaseModel):
    video_url: str
    title: Optional[str] = None
    aspect_ratio: str = "16:9"
    style: Optional[str] = "bold"
    reference_image_url: Optional[str] = None

class ThumbnailGenerateResponse(BaseModel):
    success: bool = True
    provider: str = "openrouter"
    model: str = "google/gemini-2.5-flash-image"
    aspect_ratio: str = "16:9"
    hook_text: Optional[str] = None
    thumbnails: List[ThumbnailItem] = Field(default_factory=list)
    message: Optional[str] = None
