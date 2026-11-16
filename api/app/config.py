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

    # OpenAI（api.openai.com）
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Azure OpenAI。3 つとも設定されていれば OpenAI より優先して使う。
    AZURE_OPENAI_ENDPOINT: str | None = None  # 例: https://<resource>.openai.azure.com/
    AZURE_OPENAI_API_KEY: str | None = None
    AZURE_OPENAI_DEPLOYMENT: str | None = None  # Azure 上のデプロイ名（例: gpt-4o）
    # 空なら v1 API（/openai/v1/chat/completions）。指定すると従来の
    # /openai/deployments/{deployment}/chat/completions?api-version=... を使う。
    AZURE_OPENAI_API_VERSION: str | None = None

    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def ai_mode(self) -> str:
        if self.AZURE_OPENAI_ENDPOINT and self.AZURE_OPENAI_API_KEY and self.AZURE_OPENAI_DEPLOYMENT:
            return "azure"
        return "openai" if self.OPENAI_API_KEY else "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
