from sqlalchemy import Column, Integer, String, DateTime, func
from app.core.database import Base

class History(Base):
    __tablename__ = "history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    video_title = Column(String, nullable=True)
    best_title = Column(String, nullable=True)
    opportunity_score = Column(Integer, nullable=True)
    thumbnail_style = Column(String, nullable=True)
    thumbnail_result = Column(String, nullable=True)
