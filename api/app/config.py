from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """環境変数（または api/.env）から読み込むアプリ設定。"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "sqlite:///./local.db"
    # Azure Database for MySQL は SSL 必須。true にすると certifi の CA バンドル
    # （DigiCert Global Root G2 を含む）で検証する。独自 CA を使う場合は MYSQL_SSL_CA にパスを指定。
    MYSQL_SSL: bool = False
    MYSQL_SSL_CA: str | None = None

    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def ai_mode(self) -> str:
        return "openai" if self.OPENAI_API_KEY else "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
