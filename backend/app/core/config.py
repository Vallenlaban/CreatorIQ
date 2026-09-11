import os
from pydantic_settings import BaseSettings

# Project root directory (root repository directory)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ROOT_ENV = os.path.join(ROOT_DIR, ".env")

class Settings(BaseSettings):
    APP_NAME: str = "CreatorIQ"
    DEBUG: bool = True
    DATABASE_URL: str = "sqlite:///creatoriq.db"
    
    # API Keys & Tokens
    OPENROUTER_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    YOUTUBE_API_KEY: str = ""
    HUGGINGFACE_API_TOKEN: str = ""
    GEMINI_API_KEY: str = ""
    GITHUB_MODELS_TOKEN: str = ""

    # Models
    OPENROUTER_TEXT_MODEL: str = "meta-llama/llama-3.1-8b-instruct"
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    OPENROUTER_IMAGE_MODEL: str = "google/gemini-2.5-flash-image"
    HUGGINGFACE_IMAGE_MODEL: str = "black-forest-labs/FLUX.1-schnell"
    GROQ_THUMBNAIL_MODEL_PRIMARY: str = "qwen/qwen3.6-27b"
    GROQ_THUMBNAIL_MODEL_SECONDARY: str = "qwen/qwen3.8-27b"

    # Base Paths
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    UPLOADS_DIR: str = os.path.join(BASE_DIR, "uploads")
    VIDEOS_DIR: str = os.path.join(UPLOADS_DIR, "videos")
    IMAGES_DIR: str = os.path.join(UPLOADS_DIR, "images")
    FACES_DIR: str = os.path.join(UPLOADS_DIR, "faces")
    OUTPUTS_DIR: str = os.path.join(UPLOADS_DIR, "outputs")

    class Config:
        env_file = (ROOT_ENV, ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
