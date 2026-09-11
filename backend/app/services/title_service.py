import logging
from typing import List, Dict, Any
from app.schemas.title import TitleAnalyzeRequest, TitleAnalyzeResponse, TitleItem
from app.services.youtube_service import YouTubeService
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

def calculate_potential_text(score: int) -> str:
    if score >= 90:
        return "Viral Potential"
    elif score >= 80:
        return "High Potential"
    elif score >= 70:
        return "Strong Potential"
    elif score >= 55:
        return "Moderate Potential"
    return "Emerging Potential"

class TitleService:
    @staticmethod
    async def analyze_title(payload: TitleAnalyzeRequest) -> TitleAnalyzeResponse:
        title_input = payload.title_input.strip() if payload.title_input else "Video Title Idea"
        channel_url = payload.channel_url.strip() if payload.channel_url else None

        # 1. Fetch real YouTube Data API v3 competitor context
        yt_data = await YouTubeService.get_competitor_insights(title_input, channel_url)
        yt_context = yt_data.get("summary", "YouTube context unavailable")
        yt_available = yt_data.get("available", False)

        # 2. Run AI intelligence cascade (OpenRouter -> Groq)
        ai_data, provider, err_msg = await LLMService.generate_title_intelligence(
            video_title=title_input,
            youtube_context=yt_context,
            channel_context=channel_url
        )

        if ai_data and provider:
            opp_score = int(ai_data.get("opportunity_score", 88))
            opp_score = max(10, min(99, opp_score))

            # Reasons / Analysis
            reasons_raw = ai_data.get("reasons", [])
            if not reasons_raw and isinstance(ai_data.get("analysis"), dict):
                analysis_dict = ai_data.get("analysis", {})
                reasons_raw = [
                    f"Keyword Strength: {analysis_dict.get('keyword_strength', 'Strong')}",
                    f"Clickability: {analysis_dict.get('clickability', 'High curiosity gap')}",
                    f"Trend Relevance: {analysis_dict.get('trend_relevance', 'Actively searched')}",
                    f"Competition: {analysis_dict.get('competition', 'Moderate')}"
                ]
            elif not reasons_raw and isinstance(ai_data.get("analysis"), list):
                reasons_raw = ai_data.get("analysis", [])

            if not reasons_raw:
                reasons_raw = [
                    "Strong psychological curiosity gap",
                    "High audience search intent for this topic",
                    "Clear content value proposition",
                    "Optimized title length for mobile & desktop CTR"
                ]

            # Titles parsing
            raw_titles = ai_data.get("titles", [])
            title_items: List[TitleItem] = []
            
            for idx, item in enumerate(raw_titles, start=1):
                if isinstance(item, dict):
                    t_text = str(item.get("title", "")).strip()
                    t_score = int(item.get("score", 85))
                    if t_text:
                        title_items.append(TitleItem(id=idx, title=t_text, score=t_score, isBest=False))
                elif isinstance(item, str) and item.strip():
                    title_items.append(TitleItem(id=idx, title=item.strip(), score=90 - (idx * 3), isBest=False))

            # If AI returned less than 3 titles, pad with contextual variations
            if not title_items:
                title_items = [
                    TitleItem(id=1, title=f"How I Transformed {title_input} (Full Breakdown)", score=94, isBest=False),
                    TitleItem(id=2, title=f"I Tried {title_input}... Here's What Happened", score=89, isBest=False),
                    TitleItem(id=3, title=f"The Ultimate Guide to {title_input}", score=85, isBest=False)
                ]

            # Determine Best Title based on highest score
            best_idx = 0
            highest_score = -1
            for i, item in enumerate(title_items):
                if item.score > highest_score:
                    highest_score = item.score
                    best_idx = i

            for i in range(len(title_items)):
                title_items[i].isBest = (i == best_idx)

            best_item = title_items[best_idx]

            return TitleAnalyzeResponse(
                success=True,
                provider=provider,
                opportunity_score=opp_score,
                potential_text=calculate_potential_text(opp_score),
                youtube_status="Connected" if yt_available else "Fallback Mode (Direct Analysis)",
                analysis=ai_data.get("analysis", reasons_raw),
                reasons=reasons_raw[:4],
                titles=title_items,
                recommendations=title_items,
                best_title=best_item,
                recommended_titles=[t.title for t in title_items]
            )

        # In case all providers fail, return meaningful error structure
        logger.error(f"AI Generation failed: {err_msg}")
        return TitleAnalyzeResponse(
            success=False,
            provider=None,
            opportunity_score=0,
            potential_text="Analysis Failed",
            youtube_status="Error",
            message=f"All AI providers failed: {err_msg or 'Unable to generate titles'}",
            reasons=[],
            titles=[],
            recommendations=[]
        )
