from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.config import settings
from app.database import engine, Base
from app.routers import auth, users, streaming_services, content, watchlist, recommendations, groups

# Create tables on startup (use Alembic for production migrations)
Base.metadata.create_all(bind=engine)

# Add new columns to existing tables without dropping data
with engine.connect() as conn:
    conn.execute(text("ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS rating INTEGER"))
    conn.execute(text("ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS metadata_json TEXT"))
    conn.commit()

app = FastAPI(title="Trove API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(streaming_services.router)
app.include_router(content.router)
app.include_router(watchlist.router)
app.include_router(recommendations.router)
app.include_router(groups.router)


@app.get("/health")
def health():
    return {"status": "ok"}
