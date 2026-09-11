import httpx
import logging
from typing import List, Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

class YouTubeService:
    @staticmethod
    async def get_competitor_insights(query: str, channel_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch real related video performance and style inspiration using YouTube Data API v3.
        Returns a dictionary with status, competitor videos, and extracted trends.
        If YouTube Data API fails or is unavailable, returns a safe fallback object.
        """
        api_key = settings.YOUTUBE_API_KEY
        if not api_key:
            logger.info("YOUTUBE_API_KEY is not configured.")
            return {
                "available": False,
                "message": "YouTube API key not configured",
                "videos": [],
                "summary": "YouTube competitor data unavailable"
            }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                # 1. Search related videos
                search_url = "https://www.googleapis.com/youtube/v3/search"
                search_params = {
                    "part": "snippet",
                    "q": query,
                    "maxResults": 5,
                    "type": "video",
                    "order": "relevance",
                    "key": api_key
                }

                search_res = await client.get(search_url, params=search_params)
                if search_res.status_code != 200:
                    logger.warning(f"YouTube Search API responded with status {search_res.status_code}: {search_res.text}")
                    return {
                        "available": False,
                        "message": f"YouTube API status {search_res.status_code}",
                        "videos": [],
                        "summary": "YouTube search unavailable"
                    }

                search_data = search_res.json()
                items = search_data.get("items", [])
                if not items:
                    return {
                        "available": True,
                        "message": "No matching videos found on YouTube",
                        "videos": [],
                        "summary": "No direct competitor videos found"
                    }

                video_ids = [item["id"]["videoId"] for item in items if "id" in item and "videoId" in item["id"]]

                # 2. Get video statistics (view counts, likes)
                videos_stats: Dict[str, Any] = {}
                if video_ids:
                    videos_url = "https://www.googleapis.com/youtube/v3/videos"
                    videos_params = {
                        "part": "snippet,statistics",
                        "id": ",".join(video_ids),
                        "key": api_key
                    }
                    stats_res = await client.get(videos_url, params=videos_params)
                    if stats_res.status_code == 200:
                        stats_data = stats_res.json()
                        for v in stats_data.get("items", []):
                            v_id = v.get("id")
                            v_stats = v.get("statistics", {})
                            v_snippet = v.get("snippet", {})
                            videos_stats[v_id] = {
                                "title": v_snippet.get("title", ""),
                                "channelTitle": v_snippet.get("channelTitle", ""),
                                "publishedAt": v_snippet.get("publishedAt", ""),
                                "viewCount": v_stats.get("viewCount", "0"),
                                "likeCount": v_stats.get("likeCount", "0"),
                            }

                # Construct rich video list
                competitor_videos: List[Dict[str, Any]] = []
                for item in items:
                    v_id = item.get("id", {}).get("videoId", "")
                    if v_id in videos_stats:
                        competitor_videos.append(videos_stats[v_id])
                    else:
                        snippet = item.get("snippet", {})
                        competitor_videos.append({
                            "title": snippet.get("title", ""),
                            "channelTitle": snippet.get("channelTitle", ""),
                            "publishedAt": snippet.get("publishedAt", ""),
                            "viewCount": "N/A",
                            "likeCount": "N/A"
                        })

                # Create summary text for AI context
                summary_lines = []
                for idx, v in enumerate(competitor_videos[:4], 1):
                    views = f" ({int(v['viewCount']):,} views)" if v.get("viewCount", "").isdigit() else ""
                    summary_lines.append(f"{idx}. \"{v['title']}\" by {v['channelTitle']}{views}")

                return {
                    "available": True,
                    "message": "YouTube competitor data successfully fetched",
                    "videos": competitor_videos,
                    "summary": " | ".join(summary_lines) if summary_lines else "Found competitor titles on YouTube"
                }

        except Exception as e:
            logger.warning(f"Error calling YouTube API: {e}")
            return {
                "available": False,
                "message": str(e),
                "videos": [],
                "summary": "YouTube competitor data unavailable due to network/API error"
            }
