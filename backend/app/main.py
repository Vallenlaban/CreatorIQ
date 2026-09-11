from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.config import settings
from app.core.database import Base, engine
from app.routers import api_router
from app.utils.file_utils import ensure_directory_exists

def create_application() -> FastAPI:
    # 1. Initialize SQLite Database Tables
    Base.metadata.create_all(bind=engine)

    # 2. Ensure Upload Folders Exist
    for folder in [
        settings.UPLOADS_DIR,
        settings.VIDEOS_DIR,
        settings.IMAGES_DIR,
        settings.FACES_DIR,
        settings.OUTPUTS_DIR,
    ]:
        ensure_directory_exists(folder)

    # 3. Instantiate FastAPI
    app = FastAPI(
        title=settings.APP_NAME,
        description="CreatorIQ FastAPI Backend Service - The Premium AI Assistant for YouTube Creators",
        version="1.0.0",
        debug=settings.DEBUG,
        docs_url="/docs",
        redoc_url="/redoc"
    )

    # 4. Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 5. Include API Routers (/api/health, /api/title, /api/thumbnail, /api/vision)
    app.include_router(api_router)

    # 6. Mount Static & Upload Folders
    if os.path.exists(settings.UPLOADS_DIR):
        app.mount("/uploads", StaticFiles(directory=settings.UPLOADS_DIR), name="uploads")

    return app

app = create_application()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
