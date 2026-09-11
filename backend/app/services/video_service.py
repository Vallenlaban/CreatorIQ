import re
import os
import logging
import httpx
from typing import List, Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class VideoService:
    @staticmethod
    def extract_youtube_id(url: str) -> Optional[str]:
        """Extracts 11-character YouTube video ID from various YouTube URL formats."""
        if not url:
            return None
        patterns = [
            r'(?:v=|\/|youtu\.be\/|embed\/|v\/|shorts\/)([0-9A-Za-z_-]{11})',
            r'^([0-9A-Za-z_-]{11})$'
        ]
        for pattern in patterns:
            match = re.search(pattern, url.strip())
            if match:
                return match.group(1)
        return None

    @staticmethod
    async def extract_candidate_frames(video_url: str) -> Dict[str, Any]:
        """
        Extracts high-resolution candidate frames from YouTube or video file.
        Returns candidate frame URLs/paths and metadata.
        """
        video_id = VideoService.extract_youtube_id(video_url)
        if not video_id:
            logger.warning(f"Invalid YouTube URL: {video_url}")
            return {
                "success": False,
                "error": "Invalid YouTube URL. Please provide a valid YouTube video link.",
                "frames": []
            }

        # Candidate frame URLs from YouTube's CDN at different key moments
        candidates = [
            f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
            f"https://img.youtube.com/vi/{video_id}/sddefault.jpg",
            f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
            f"https://img.youtube.com/vi/{video_id}/0.jpg",
            f"https://img.youtube.com/vi/{video_id}/1.jpg",
            f"https://img.youtube.com/vi/{video_id}/2.jpg",
            f"https://img.youtube.com/vi/{video_id}/3.jpg"
        ]

        valid_frames = []
        best_frame_url = None

        async with httpx.AsyncClient(timeout=8.0) as client:
            for url in candidates:
                try:
                    res = await client.head(url)
                    if res.status_code == 200:
                        valid_frames.append(url)
                        if not best_frame_url:
                            best_frame_url = url
                except Exception as e:
                    logger.debug(f"Frame check failed for {url}: {e}")

        if not valid_frames:
            # Fallback to standard hqdefault
            best_frame_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
            valid_frames = [best_frame_url]

        return {
            "success": True,
            "video_id": video_id,
            "best_frame": best_frame_url,
            "candidate_frames": valid_frames
        }
