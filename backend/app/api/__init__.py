from app.api.health import router as health_router
from app.api.title import router as title_router
from app.api.thumbnail import router as thumbnail_router
from app.api.vision import router as vision_router

__all__ = ["health_router", "title_router", "thumbnail_router", "vision_router"]
