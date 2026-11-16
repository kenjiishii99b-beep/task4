import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import router
from app.services.ai import AIError
from app.services.knowledge import NotFoundError, ValidationError

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="共通知＆人物マップ API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

    # 想定外の例外は CORS ミドルウェアの「内側」で 500 に変換する。
    # exception_handler(Exception) は CORS の外側で処理されるため、500 応答に CORS ヘッダーが付かず、
    # ブラウザでは「接続できない」ように見えてしまう。
    @app.middleware("http")
    async def _catch_unexpected(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            logger.exception("unhandled error: %s %s", request.method, request.url.path)
            return JSONResponse(status_code=500, content={"detail": "サーバーでエラーが発生しました。時間をおいて再度お試しください。"})

    # API とフロントが別ドメイン（SWA Free）のため CORS が必要。
    # App Service / Function App のポータル側 CORS 設定とは二重にしないこと（どちらか一方で管理する）。
    # add_middleware は後に追加したものほど外側になるので、CORS を最後に追加する。
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ValidationError)
    async def _invalid(_: Request, exc: ValidationError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(AIError)
    async def _ai(_: Request, exc: AIError):
        logger.warning("AI error: %s", exc)
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    app.include_router(router)
    return app


app = create_app()
