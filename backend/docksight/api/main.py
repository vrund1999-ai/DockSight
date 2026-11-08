from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from docksight.api.routers import auth_router, router
from docksight.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="DockSight API",
        version="0.1.0",
        description="Portfolio analytics and lease-renewal predictions for last-mile industrial.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    @app.get("/api/health", tags=["ops"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(router)
    return app


app = create_app()
