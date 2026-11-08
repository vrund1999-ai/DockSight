from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DOCKSIGHT_", env_file=".env", extra="ignore")

    database_url: str = f"sqlite:///{BACKEND_DIR / 'docksight.db'}"
    artifacts_dir: Path = BACKEND_DIR / "artifacts"
    mlflow_tracking_uri: str = f"sqlite:///{BACKEND_DIR / 'mlflow.db'}"

    # Auth. The default secret is for local development only; it is overridden in any deployment.
    jwt_secret: str = "dev-only-insecure-secret-override-in-deployments"
    jwt_algorithm: str = "HS256"
    jwt_ttl_minutes: int = 60
    demo_username: str = "analyst"
    demo_password: str = "docksight"

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]
    seed: int = 42

    @property
    def model_path(self) -> Path:
        return self.artifacts_dir / "renewal_model.joblib"


@lru_cache
def get_settings() -> Settings:
    return Settings()
