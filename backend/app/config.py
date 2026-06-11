from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    google_client_id: str
    tmdb_api_key: str
    openai_api_key: str
    frontend_url: str = "http://localhost:5173"

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    class Config:
        env_file = ".env"


settings = Settings()
