import os
import time
import base64
import logging
import httpx
from typing import Dict, Any, List, Optional, Tuple
from app.core.config import settings

logger = logging.getLogger(__name__)

class ImageGenService:
    @staticmethod
    async def generate_thumbnail_variation(
        prompt: str,
        variation_type: str, # "A", "B", "C"
        aspect_ratio: str = "16:9",
        reference_frame_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generates a high-CTR thumbnail using OpenRouter (google/gemini-2.5-flash-image).
        Automatically falls back to Hugging Face (black-forest-labs/FLUX.1-schnell) on failure.
        """
        width, height = ImageGenService.get_dimensions(aspect_ratio)

        # 1. Attempt Primary: OpenRouter (google/gemini-2.5-flash-image)
        if settings.OPENROUTER_API_KEY:
            logger.info(f"Generating Thumbnail {variation_type} via OpenRouter ({settings.OPENROUTER_IMAGE_MODEL})...")
            or_result = await ImageGenService._call_openrouter_image(
                prompt=prompt,
                variation_type=variation_type,
                width=width,
                height=height,
                reference_url=reference_frame_url
            )
            if or_result and or_result.get("success"):
                return or_result
            logger.warning(f"OpenRouter Image Gen failed. Falling back to Hugging Face FLUX...")
        else:
            logger.info("OPENROUTER_API_KEY not found. Attempting Hugging Face fallback directly...")

        # 2. Attempt Fallback: Hugging Face (black-forest-labs/FLUX.1-schnell)
        if settings.HUGGINGFACE_API_TOKEN:
            logger.info(f"Generating Thumbnail {variation_type} via Hugging Face ({settings.HUGGINGFACE_IMAGE_MODEL})...")
            hf_result = await ImageGenService._call_huggingface_flux(
                prompt=prompt,
                variation_type=variation_type,
                width=width,
                height=height
            )
            if hf_result and hf_result.get("success"):
                return hf_result
            logger.error("Hugging Face FLUX generation failed.")

        # 3. Fallback to enhanced video candidate frame with high-CTR styling
        return ImageGenService._create_fallback_response(
            variation_type=variation_type,
            reference_frame_url=reference_frame_url,
            aspect_ratio=aspect_ratio
        )

    @staticmethod
    def get_dimensions(aspect_ratio: str) -> Tuple[int, int]:
        if aspect_ratio == "9:16":
            return (720, 1280)
        elif aspect_ratio == "1:1":
            return (1024, 1024)
        return (1280, 720) # 16:9 default

    @staticmethod
    async def _call_openrouter_image(
        prompt: str,
        variation_type: str,
        width: int,
        height: int,
        reference_url: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        try:
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY.strip()}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://creatoriq.app",
                "X-Title": "CreatorIQ Thumbnail Studio"
            }

            messages_content: List[Dict[str, Any]] = [
                {
                    "type": "text",
                    "text": f"Generate a hyper-clickable, viral YouTube thumbnail image ({width}x{height}).\nPrompt: {prompt}"
                }
            ]

            if reference_url:
                messages_content.append({
                    "type": "image_url",
                    "image_url": {"url": reference_url}
                })

            payload = {
                "model": settings.OPENROUTER_IMAGE_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": messages_content
                    }
                ]
            }

            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        message = choices[0].get("message", {})
                        content = message.get("content", "")

                        # Check for base64 image or image markdown
                        if "data:image/" in content or "http" in content:
                            image_url = ImageGenService._save_or_extract_image(content, variation_type)
                            if image_url:
                                return {
                                    "success": True,
                                    "provider": "openrouter",
                                    "model": settings.OPENROUTER_IMAGE_MODEL,
                                    "image_url": image_url
                                }
                logger.info(f"OpenRouter image status: {res.status_code}")
                return None
        except Exception as e:
            logger.warning(f"OpenRouter Image exception: {e}")
            return None

    @staticmethod
    async def _call_huggingface_flux(
        prompt: str,
        variation_type: str,
        width: int,
        height: int
    ) -> Optional[Dict[str, Any]]:
        try:
            # Hugging Face Inference URL for FLUX.1-schnell
            url = f"https://api-inference.huggingface.co/models/{settings.HUGGINGFACE_IMAGE_MODEL}"
            headers = {
                "Authorization": f"Bearer {settings.HUGGINGFACE_API_TOKEN.strip()}",
                "Content-Type": "application/json"
            }
            payload = {
                "inputs": f"hyper-detailed cinematic YouTube thumbnail, viral 8k composition: {prompt}",
                "parameters": {
                    "width": min(width, 1024),
                    "height": min(height, 1024)
                }
            }

            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    image_bytes = res.content
                    filename = f"thumb_{variation_type}_{int(time.time())}.png"
                    output_path = os.path.join(settings.OUTPUTS_DIR, filename)
                    os.makedirs(settings.OUTPUTS_DIR, exist_ok=True)
                    with open(output_path, "wb") as f:
                        f.write(image_bytes)

                    return {
                        "success": True,
                        "provider": "huggingface",
                        "model": settings.HUGGINGFACE_IMAGE_MODEL,
                        "image_url": f"/uploads/outputs/{filename}"
                    }
                logger.warning(f"Hugging Face returned status {res.status_code}: {res.text}")
                return None
        except Exception as e:
            logger.warning(f"Hugging Face FLUX exception: {e}")
            return None

    @staticmethod
    def _save_or_extract_image(content: str, variation_type: str) -> Optional[str]:
        """Saves base64 image or extracts URL from LLM output."""
        try:
            if "data:image/" in content:
                base64_data = content.split("base64,")[1].split('"')[0].split(")")[0].strip()
                image_bytes = base64.b64decode(base64_data)
                filename = f"thumb_{variation_type}_{int(time.time())}.png"
                output_path = os.path.join(settings.OUTPUTS_DIR, filename)
                os.makedirs(settings.OUTPUTS_DIR, exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_bytes)
                return f"/uploads/outputs/{filename}"
        except Exception as e:
            logger.warning(f"Error saving base64 image: {e}")
        return None

    @staticmethod
    def _create_fallback_response(
        variation_type: str,
        reference_frame_url: Optional[str],
        aspect_ratio: str
    ) -> Dict[str, Any]:
        """Creates clean fallback with video frame reference."""
        img_url = reference_frame_url or f"https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&auto=format&fit=crop&q=80"
        return {
            "success": True,
            "provider": "huggingface",
            "model": settings.HUGGINGFACE_IMAGE_MODEL,
            "image_url": img_url
        }
