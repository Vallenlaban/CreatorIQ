from fastapi import APIRouter
from app.api.health import router as health_router
from app.api.title import router as title_router
from app.api.thumbnail import router as thumbnail_router
from app.api.vision import router as vision_router

api_router = APIRouter(prefix="/api")

api_router.include_router(health_router)
api_router.include_router(title_router)
api_router.include_router(thumbnail_router)
api_router.include_router(vision_router)

__all__ = ["api_router"]
