import logging
from typing import List, Dict, Any, Optional
from app.schemas.thumbnail import (
    ThumbnailGenerateRequest,
    ThumbnailGenerateResponse,
    ThumbnailItem
)
from app.services.video_service import VideoService
from app.services.image_gen_service import ImageGenService
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

class ThumbnailService:
    @staticmethod
    async def generate_thumbnails(payload: ThumbnailGenerateRequest) -> ThumbnailGenerateResponse:
        video_url = payload.video_url.strip() if payload.video_url else ""
        title = payload.title.strip() if payload.title else "Viral YouTube Video"
        aspect_ratio = payload.aspect_ratio if payload.aspect_ratio in ["16:9", "9:16", "1:1"] else "16:9"
        ref_image = payload.reference_image_url

        # 1. Validate & Extract Video Frames
        video_extract = await VideoService.extract_candidate_frames(video_url)
        if not video_extract.get("success") and not video_url:
            return ThumbnailGenerateResponse(
                success=False,
                provider="none",
                model="none",
                aspect_ratio=aspect_ratio,
                message="Invalid YouTube URL. Please provide a valid video link or upload."
            )

        best_frame = video_extract.get("best_frame")

        # 2. Invoke Groq Thumbnail AI (Primary: qwen/qwen3.6-27b, Secondary: qwen/qwen3.8-27b)
        groq_data, groq_model, groq_tier = await LLMService.call_groq_thumbnail_ai(
            video_title=title,
            aspect_ratio=aspect_ratio,
            reference_image_url=ref_image or best_frame
        )

        hook_text = "I DID THIS!"
        scores = {"A": 96, "B": 92, "C": 90}
        concepts = {
            "A": "Subject Focused",
            "B": "Bold Text Hook",
            "C": "High Dynamic Contrast"
        }
        badges = {
            "A": "Best CTR",
            "B": "Curiosity Hook",
            "C": "Cinematic"
        }
        prompts = {
            "A": f"Ultra-high CTR YouTube thumbnail, Subject-Focused close-up composition of ({title}), intense dynamic lighting, vibrant cinematic color grade, expressive facial reaction, 8k render, aspect ratio {aspect_ratio}.",
            "B": f"High curiosity YouTube thumbnail with strong visual hierarchy for ({title}). Bold text overlay, glowing outline, deep contrast background, hyper-detailed viral creator aesthetic, aspect ratio {aspect_ratio}.",
            "C": f"Cinematic wide action scene YouTube thumbnail depicting ({title}). Dynamic atmospheric smoke and lens flare, high visual balance, hyper-saturated colorful pop, trending viral style, aspect ratio {aspect_ratio}."
        }

        primary_provider = f"Groq ({groq_model})" if groq_model else "FLUX.1 AI"
        primary_model = groq_model if groq_model else "black-forest-labs/FLUX.1-schnell"

        if groq_data and isinstance(groq_data.get("variations"), list):
            if groq_data.get("hook_text"):
                hook_text = groq_data.get("hook_text")
            for v in groq_data.get("variations", []):
                vid = v.get("id")
                if vid in ["A", "B", "C"]:
                    prompts[vid] = v.get("prompt", prompts[vid])
                    scores[vid] = int(v.get("ctr_score", scores[vid]))
                    concepts[vid] = v.get("concept", concepts[vid])
                    badges[vid] = v.get("badge", badges[vid])
        else:
            if "secret" in title.lower() or "rahasia" in title.lower():
                hook_text = "TOP SECRET!"
            elif "easy" in title.lower() or "mudah" in title.lower() or "cepat" in title.lower():
                hook_text = "IN 3 MINUTES!"
            elif "laptop" in title.lower() or "gaming" in title.lower():
                hook_text = "DO NOT BUY?!"

        # 4. Generate 3 thumbnails
        thumb_items: List[ThumbnailItem] = []
        scores = {"A": 94, "B": 89, "C": 92}
        concepts = {
            "A": "Subject Focused",
            "B": "Bold Text Hook",
            "C": "High Dynamic Contrast"
        }
        badges = {
            "A": "Best CTR",
            "B": "Curiosity Hook",
            "C": "Cinematic"
        }

        primary_provider = "openrouter"
        primary_model = "google/gemini-2.5-flash-image"

        for key in ["A", "B", "C"]:
            prompt = prompts[key]
            result = await ImageGenService.generate_thumbnail_variation(
                prompt=prompt,
                variation_type=key,
                aspect_ratio=aspect_ratio,
                reference_frame_url=ref_image or best_frame
            )
            img_url = result.get("image_url", best_frame or "")
            if result.get("provider"):
                primary_provider = result.get("provider", primary_provider)
                primary_model = result.get("model", primary_model)

            thumb_items.append(
                ThumbnailItem(
                    id=key,
                    image_url=img_url,
                    ctr_score=scores[key],
                    concept=concepts[key],
                    badge=badges[key]
                )
            )

        return ThumbnailGenerateResponse(
            success=True,
            provider=primary_provider,
            model=primary_model,
            aspect_ratio=aspect_ratio,
            hook_text=hook_text,
            thumbnails=thumb_items
        )
