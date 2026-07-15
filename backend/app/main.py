import threading
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.config import settings
from app.database import engine, Base, SessionLocal
from app import models
from app.routers import auth, users, streaming_services, content, watchlist, recommendations, groups, group_recommendations

# Create tables on startup (use Alembic for production migrations)
Base.metadata.create_all(bind=engine)

# Add new columns to existing tables without dropping data
with engine.connect() as conn:
    conn.execute(text("ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS rating INTEGER"))
    conn.execute(text("ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS metadata_json TEXT"))
    conn.execute(text("ALTER TABLE group_watchlist_items ADD COLUMN IF NOT EXISTS metadata_json TEXT"))
    # Superseded by per-member ratings in group_item_ratings
    conn.execute(text("ALTER TABLE group_watchlist_items DROP COLUMN IF EXISTS rating"))
    # Superseded by group_excluded_services (allow-list -> exclusion-list model)
    conn.execute(text("DROP TABLE IF EXISTS group_streaming_services"))
    conn.commit()


def _backfill_group_metadata() -> None:
    """Enrich group watchlist items missing metadata or missing new fields (e.g. original_language)."""
    import json as _json
    from app.routers.groups import _enrich_group_item_metadata
    db = SessionLocal()
    try:
        items = db.query(models.GroupWatchlistItem).all()
        ids = []
        for item in items:
            if item.metadata_json is None:
                ids.append(item.id)
                continue
            try:
                meta = _json.loads(item.metadata_json)
                if "original_language" not in meta:
                    item.metadata_json = None  # force re-enrichment
                    ids.append(item.id)
            except Exception:
                item.metadata_json = None
                ids.append(item.id)
        if ids:
            db.commit()
    finally:
        db.close()
    if ids:
        with ThreadPoolExecutor(max_workers=min(len(ids), 10)) as pool:
            list(pool.map(_enrich_group_item_metadata, ids))


app = FastAPI(title="Trove API", version="1.0.0")


@app.on_event("startup")
async def startup_event():
    threading.Thread(target=_backfill_group_metadata, daemon=True).start()

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
app.include_router(group_recommendations.router)


@app.get("/health")
def health():
    return {"status": "ok"}
