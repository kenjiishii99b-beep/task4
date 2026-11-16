import os
import sys
import tempfile
from pathlib import Path

import pytest

# app を import する前にテスト用 DB とモック AI を設定する
_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.as_posix()}"
os.environ["OPENAI_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app import models  # noqa: E402,F401
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed(reset=True)
    with TestClient(app) as c:
        yield c
