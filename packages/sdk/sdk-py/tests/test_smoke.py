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
    if isinstance(health, dict):
        status = health.get("status")
    else:
        status = getattr(health, "status", None)
    assert status, "health status missing"

    models = client.get_models()
    if isinstance(models, dict):
        models_list = models.get("models") or models.get("data")
    else:
        models_list = getattr(models, "models", None) or getattr(models, "data", None)
    assert models_list, "models list empty"

    responses_payload = _MANIFEST["operations"]["responses"]["body"]
    responses = client.responses.create(responses_payload)
    if isinstance(responses, dict):
        choices = responses.get("choices")
        content = responses.get("content")
        output = responses.get("output")
        output_text = responses.get("output_text")
    else:
        choices = getattr(responses, "choices", None)
        content = getattr(responses, "content", None)
        output = getattr(responses, "output", None)
        output_text = getattr(responses, "output_text", None)
    assert choices or content or output or output_text, "responses missing output or content"

    unauth = _MANIFEST["operations"]["unauthorized"]
    unauth_method = unauth.get("method", "GET").upper()
    unauth_body = unauth.get("body") or _MANIFEST["operations"]["chat"]["body"]
    unauth_res = httpx.request(
        unauth_method,
        f"{BASE_URL}{unauth['path']}",
        json=unauth_body if unauth_method != "GET" else None,
        timeout=10.0,
    )
    assert unauth_res.status_code in (unauth["expectStatus"], 403)

    not_found = _MANIFEST["operations"]["notFound"]
    nf_res = httpx.get(
        f"{BASE_URL}{not_found['path']}",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=10.0,
    )
    assert nf_res.status_code == not_found["expectStatus"]
