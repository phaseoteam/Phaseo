import json
import os
from pathlib import Path

import httpx
import pytest

from ai_stats import AIStats


_MANIFEST_PATH = Path(__file__).resolve().parents[2] / "smoke-manifest.json"
_MANIFEST = json.loads(_MANIFEST_PATH.read_text())

API_KEY_ENV = _MANIFEST.get("apiKeyEnv", "AI_STATS_API_KEY")
BASE_URL_ENV = _MANIFEST.get("baseUrlEnv", "AI_STATS_BASE_URL")
API_KEY = os.getenv(API_KEY_ENV)
BASE_URL = (os.getenv(BASE_URL_ENV) or _MANIFEST["defaultBaseUrl"]).rstrip("/")

pytestmark = pytest.mark.skipif(not API_KEY, reason=f"Set {API_KEY_ENV} to run smoke tests")


def test_smoke_suite():
    client = AIStats(api_key=API_KEY, base_url=BASE_URL)

    health = client.get_health()
    assert getattr(health, "status", None), "health status missing"

    models = client.list_models()
    assert models.models, "models list empty"

    chat_payload = _MANIFEST["operations"]["chat"]["body"]
    chat = client.generate_text(chat_payload)
    assert chat.choices, "chat choices empty"

    unauth = _MANIFEST["operations"]["unauthorized"]
    unauth_res = httpx.get(f"{BASE_URL}{unauth['path']}", timeout=10.0)
    assert unauth_res.status_code in (unauth["expectStatus"], 403)

    not_found = _MANIFEST["operations"]["notFound"]
    nf_res = httpx.get(
        f"{BASE_URL}{not_found['path']}",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=10.0,
    )
    assert nf_res.status_code == not_found["expectStatus"]
