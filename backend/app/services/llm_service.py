import json
import re
import logging
import httpx
from typing import Optional, Dict, Any, Tuple, List
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an elite YouTube Growth Consultant and Viral Title Optimization AI.
Your job is to analyze a creator's raw video title idea, examine competitor patterns and market trends, and engineer 3 hyper-clickable, high-CTR YouTube titles designed to maximize views and retention without cheap misleading clickbait.

CRITICAL INSTRUCTIONS:
1. NEVER output dummy or generic placeholders (e.g. do NOT output Minecraft titles unless the input is about Minecraft).
2. Adapt titles directly to the topic and language of the user's input (e.g., Indonesian input should get natural, viral Indonesian titles or creator-standard phrasing; English gets high-converting English titles).
3. Calculate an Opportunity Score (0-100) reflecting the topic's viral potential, search interest, and curiosity gap.
4. Output 4 bullet-point reasons explaining why this title formula will perform well.
5. Provide 3 distinct title variations with individual scores (0-100), ranked by performance.
6. The title with the highest score must be selected as best_title.

You MUST respond ONLY with a valid, clean JSON object matching this exact schema:
{
  "opportunity_score": 91,
  "analysis": {
    "keyword_strength": "High search intent around core topic",
    "clickability": "Strong psychological curiosity gap",
    "trend_relevance": "Actively searched format",
    "competition": "Moderate competition with high audience demand"
  },
  "reasons": [
    "Strong emotional hook and curiosity gap",
    "High audience search intent for this topic",
    "Clear value proposition in under 60 characters",
    "Proven format that drives high initial CTR"
  ],
  "titles": [
    {
      "title": "Example Title 1",
      "score": 95
    },
    {
      "title": "Example Title 2",
      "score": 90
    },
    {
      "title": "Example Title 3",
      "score": 86
    }
  ],
  "best_title": "Example Title 1"
}
Do NOT include markdown formatting, backticks, or introductory text. Return only valid JSON."""

class LLMService:
    @staticmethod
    async def generate_title_intelligence(
        video_title: str,
        youtube_context: str,
        channel_context: Optional[str] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
        """
        Executes AI cascade strictly as defined:
        1. OpenRouter (Primary) -> meta-llama/llama-3.1-8b-instruct
        2. Groq (Fallback) -> openai/gpt-oss-20b (with auto fallback to llama-3.1-8b-instant if needed)
        Returns: (result_dict, provider_name, error_message)
        """
        user_prompt_content = f"User Video Title Idea: \"{video_title}\"\n"
        if channel_context:
            user_prompt_content += f"Reference Channel / Style: {channel_context}\n"
        if youtube_context and "unavailable" not in youtube_context.lower():
            user_prompt_content += f"YouTube Competitor & Market Context: {youtube_context}\n"
        else:
            user_prompt_content += "YouTube Context: No competitor data available. Perform deep semantic and psychological clickability analysis based on the input topic.\n"

        user_prompt_content += "\nGenerate the 3 viral title variations, opportunity score, analysis, and reasons now."

        # 1. Primary AI: OpenRouter
        if settings.OPENROUTER_API_KEY:
            logger.info("Attempting Primary AI: OpenRouter (meta-llama/llama-3.1-8b-instruct:free)")
            openrouter_res, openrouter_err = await LLMService._call_openrouter(user_prompt_content)
            if openrouter_res:
                logger.info("OpenRouter generation succeeded.")
                return openrouter_res, "OpenRouter", None
            logger.warning(f"OpenRouter failed: {openrouter_err}. Falling back to Groq Cloud...")
        else:
            logger.info("OPENROUTER_API_KEY not configured. Skipping to Groq.")

        # 2. Fallback AI: Groq Cloud
        if settings.GROQ_API_KEY:
            logger.info("Attempting Fallback AI: Groq Cloud")
            groq_res, groq_err = await LLMService._call_groq(user_prompt_content)
            if groq_res:
                logger.info("Groq generation succeeded.")
                return groq_res, "Groq", None
            logger.warning(f"Groq Cloud failed: {groq_err}")
            return None, None, f"OpenRouter & Groq both failed. ({groq_err})"

        return None, None, "No active AI provider API key found (OPENROUTER_API_KEY or GROQ_API_KEY)."

    @staticmethod
    async def _call_openrouter(prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        try:
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY.strip()}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://creatoriq.app",
                "X-Title": "CreatorIQ Title Intelligence"
            }
            payload = {
                "model": "meta-llama/llama-3.1-8b-instruct:free",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "response_format": {"type": "json_object"}
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    choices = data.get("choices", [])
                    if choices:
                        content = choices[0].get("message", {}).get("content", "")
                        parsed = LLMService._parse_json(content)
                        if parsed:
                            return parsed, None
                        return None, "Failed to parse JSON response from OpenRouter"
                    return None, f"OpenRouter returned empty choices: {data}"
                return None, f"OpenRouter HTTP {response.status_code}: {response.text}"
        except Exception as e:
            return None, f"OpenRouter Exception: {str(e)}"

    @staticmethod
    async def _call_groq(prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Calls Groq API with models openai/gpt-oss-120b and fallbacks."""
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.GROQ_API_KEY.strip()}",
            "Content-Type": "application/json"
        }

        models_to_try = [
            settings.GROQ_MODEL or "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
            "qwen/qwen3.6-27b"
        ]

        last_error = "Unknown error"
        for model in models_to_try:
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "response_format": {"type": "json_object"}
                }

                async with httpx.AsyncClient(timeout=12.0) as client:
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code == 200:
                        data = response.json()
                        choices = data.get("choices", [])
                        if choices:
                            content = choices[0].get("message", {}).get("content", "")
                            parsed = LLMService._parse_json(content)
                            if parsed:
                                return parsed, None
                        return None, f"Failed to parse JSON response from Groq ({model})"
                    last_error = f"Groq ({model}) HTTP {response.status_code}: {response.text}"
            except Exception as e:
                last_error = f"Groq Exception ({model}): {str(e)}"

        return None, last_error

    @staticmethod
    def _parse_json(text: str) -> Optional[Dict[str, Any]]:
        """Cleans and parses raw LLM output into a dictionary."""
        if not text:
            return None

        cleaned = text.strip()
        # Remove Markdown code blocks
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        # Direct JSON load attempt
        try:
            return json.loads(cleaned)
        except Exception:
            pass

        # Try to locate JSON object substring
        json_match = re.search(r'(\{[\s\S]*\})', cleaned)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except Exception as e:
                logger.warning(f"Regex JSON parse failed: {e}")

        return None

    @staticmethod
    async def call_groq_thumbnail_ai(
        video_title: str,
        aspect_ratio: str = "16:9",
        reference_image_url: Optional[str] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
        """
        Calls Groq API for Thumbnail AI with:
        - Primary: qwen/qwen3.6-27b
        - Secondary: qwen/qwen3.8-27b
        Returns: (data, model_name, tier_name)
        """
        if not settings.GROQ_API_KEY:
            return None, None, "GROQ_API_KEY not configured"

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.GROQ_API_KEY.strip()}",
            "Content-Type": "application/json"
        }

        thumbnail_prompt = f"""You are CreatorIQ's elite YouTube Thumbnail Art Director.
Analyze this YouTube video topic for viral thumbnail generation:
Video Title: "{video_title}"
Target Aspect Ratio: {aspect_ratio}

Generate viral hook text, 3 distinct thumbnail compositions (Subject Focused, Bold Text Hook, High Dynamic Contrast), and descriptive image rendering prompts.
Output strictly valid JSON:
{{
  "hook_text": "2-4 words viral hook phrase (e.g. 'I REGRET THIS!', 'DO NOT BUY?!', '$50,000 ERROR')",
  "variations": [
    {{
      "id": "A",
      "concept": "Subject Focused",
      "badge": "Best CTR",
      "ctr_score": 96,
      "hook_text": "short punchy text",
      "prompt": "Detailed AI image generation prompt for close-up emotional subject, intense rim lighting, 8k viral creator style, vibrant color grade"
    }},
    {{
      "id": "B",
      "concept": "Bold Text Hook",
      "badge": "Curiosity Hook",
      "ctr_score": 92,
      "hook_text": "short punchy text",
      "prompt": "Detailed AI image generation prompt with bold glowing hierarchy, neon outline, curiosity gap visual cue, deep contrast"
    }},
    {{
      "id": "C",
      "concept": "High Dynamic Contrast",
      "badge": "Cinematic Action",
      "ctr_score": 90,
      "hook_text": "short punchy text",
      "prompt": "Detailed AI image generation prompt with cinematic wide angle action, atmospheric volumetric lighting, explosive saturated pop, 8k resolution"
    }}
  ]
}}"""

        primary_model = settings.GROQ_THUMBNAIL_MODEL_PRIMARY or "qwen/qwen3.6-27b"
        secondary_model = settings.GROQ_THUMBNAIL_MODEL_SECONDARY or "qwen/qwen3.8-27b"

        models_to_try = [
            (primary_model, "Primary"),
            (secondary_model, "Secondary"),
            ("openai/gpt-oss-120b", "Fallback")
        ]

        async with httpx.AsyncClient(timeout=15.0) as client:
            for model_name, tier in models_to_try:
                try:
                    logger.info(f"[Groq Thumbnail AI] Attempting {tier} model ({model_name})...")
                    payload = {
                        "model": model_name,
                        "messages": [
                            {"role": "user", "content": thumbnail_prompt}
                        ],
                        "temperature": 0.7,
                        "response_format": {"type": "json_object"}
                    }
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code == 200:
                        data = response.json()
                        choices = data.get("choices", [])
                        if choices:
                            raw_content = choices[0].get("message", {}).get("content", "")
                            parsed = LLMService._parse_json(raw_content)
                            if parsed and isinstance(parsed.get("variations"), list):
                                logger.info(f"[Groq Thumbnail AI] Success with {tier} model: {model_name}")
                                return parsed, model_name, tier
                    else:
                        logger.warning(f"[Groq Thumbnail AI] ({model_name}) HTTP {response.status_code}: {response.text}")
                except Exception as e:
                    logger.warning(f"[Groq Thumbnail AI] ({model_name}) error: {e}")

        return None, None, "All Groq thumbnail models failed"
