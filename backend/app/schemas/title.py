from pydantic import BaseModel, Field
from typing import List, Optional, Union, Dict, Any

class TitleAnalyzeRequest(BaseModel):
    title_input: str
    channel_url: Optional[str] = None

class TitleItem(BaseModel):
    id: Optional[int] = None
    title: str
    score: int
    isBest: bool = False

class TitleAnalyzeResponse(BaseModel):
    success: bool = True
    provider: Optional[str] = None
    opportunity_score: int = 0
    potential_text: Optional[str] = "Viral Potential"
    youtube_status: Optional[str] = None
    analysis: Optional[Union[Dict[str, Any], List[str]]] = None
    reasons: List[str] = Field(default_factory=list)
    titles: List[TitleItem] = Field(default_factory=list)
    recommendations: List[TitleItem] = Field(default_factory=list)
    best_title: Optional[Union[TitleItem, str]] = None
    recommended_titles: Optional[List[str]] = None
    message: Optional[str] = None
