# Trove

A watchlist and recommendation app for movies and TV shows.

## Deployment (Render)

The root `Dockerfile` builds the frontend and backend into a single
container: nginx serves the built static frontend and proxies `/api/*` to
the FastAPI backend (both run together via `supervisord`). nginx listens on
whatever port Render assigns via the `PORT` environment variable.

The database is external (e.g. [Neon](https://neon.tech)'s free tier), so
this service is stateless — its data is unaffected by restarts, redeploys,
or the free tier's spin-down/spin-up cycle.

### 1. Provision a Postgres database

Create a free database on [Neon](https://neon.tech) (or Supabase) and copy
its connection string.

### 2. Create a Render Web Service

- New **Web Service** → connect this repo → **Docker** as the runtime.
- Root directory: repo root (uses the top-level `Dockerfile`).

### 3. Set environment variables

In the service's **Environment** tab, add:

| Name | Notes |
|---|---|
| `DATABASE_URL` | Must use the `postgresql+psycopg://` scheme, e.g. `postgresql+psycopg://user:pass@ep-xxx.neon.tech/trove?sslmode=require` |
| `SECRET_KEY` | Random string, 32+ chars |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `TMDB_API_KEY` | TMDB API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `FRONTEND_URL` | This service's public URL, e.g. `https://trove.onrender.com` |
| `VITE_GOOGLE_CLIENT_ID` | Same value as `GOOGLE_CLIENT_ID` — Render injects service env vars as Docker build args, so this gets baked into the frontend at build time |

Render sets `PORT` automatically; no need to add it yourself.

### 4. Deploy

Render builds and deploys automatically on push once the service is
connected to the repo.
