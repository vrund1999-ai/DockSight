import os
import tempfile
from pathlib import Path

# Must be set before docksight.db is imported, since the engine is created at import time.
_TMP = Path(tempfile.mkdtemp(prefix="docksight-test-"))
# CI also runs the suite against Postgres by pre-setting DOCKSIGHT_DATABASE_URL.
os.environ.setdefault("DOCKSIGHT_DATABASE_URL", f"sqlite:///{_TMP / 'test.db'}")
os.environ["DOCKSIGHT_ARTIFACTS_DIR"] = str(_TMP / "artifacts")
os.environ["DOCKSIGHT_MLFLOW_TRACKING_URI"] = f"sqlite:///{_TMP / 'mlflow.db'}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from docksight.config import get_settings  # noqa: E402
from docksight.db import engine  # noqa: E402
from docksight.ml.model import ModelArtifact  # noqa: E402
from docksight.ml.train import train  # noqa: E402
from docksight.pipeline.generate import Portfolio, generate  # noqa: E402
from docksight.pipeline.io import write_portfolio  # noqa: E402
from docksight.pipeline.run import features_for, score  # noqa: E402


@pytest.fixture(scope="session")
def portfolio() -> Portfolio:
    return generate(seed=7, n_properties=400)


@pytest.fixture(scope="session")
def features(portfolio):
    return features_for(portfolio)


@pytest.fixture(scope="session")
def artifact(portfolio, features) -> ModelArtifact:
    write_portfolio(engine, portfolio)
    art = train(features)
    art.save(get_settings().model_path)
    score(engine, features, art)
    return art


@pytest.fixture(scope="session")
def client(artifact) -> TestClient:
    from docksight.api.main import app

    return TestClient(app)


@pytest.fixture(scope="session")
def auth(client) -> dict[str, str]:
    s = get_settings()
    r = client.post(
        "/api/auth/token", json={"username": s.demo_username, "password": s.demo_password}
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
