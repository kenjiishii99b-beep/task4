"""Azure Functions のエントリポイント。

FastAPI アプリ全体を 1 つの HTTP トリガーとして公開する。
host.json で routePrefix を "" にしているため、FastAPI 側のパス（/api/...）がそのまま URL になる。
"""

import azure.functions as func

from app.main import app as fastapi_app

app = func.AsgiFunctionApp(app=fastapi_app, http_auth_level=func.AuthLevel.ANONYMOUS)
