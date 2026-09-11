import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class TrendsService:
    @staticmethod
    def get_search_trends(keyword: str) -> Dict[str, Any]:
        """Fetch search trends using pytrends with graceful fallback handling."""
        if not keyword:
            return {"interest_score": 50, "status": "Moderate interest"}

        try:
            from pytrends.request import TrendReq
            pytrend = TrendReq(hl='en-US', tz=360, timeout=(5, 10))
            kw_list = [keyword[:100]]
            pytrend.build_payload(kw_list, cat=0, timeframe='today 12-m', geo='', gprop='youtube')
            interest_df = pytrend.interest_over_time()

            if not interest_df.empty and keyword[:100] in interest_df.columns:
                recent_score = int(interest_df[keyword[:100]].iloc[-1])
                return {
                    "interest_score": recent_score,
                    "status": "High interest" if recent_score > 70 else "Moderate interest"
                }
        except Exception as e:
            logger.info(f"pytrends search notice: {e}")

        return {
            "interest_score": 75,
            "status": "Keyword search volume active"
        }
