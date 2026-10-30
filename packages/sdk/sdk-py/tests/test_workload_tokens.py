import base64
import json

import httpx
import pytest

from phaseo import Phaseo, github_actions_token, vercel_token

GITHUB_ENV = {
    "ACTIONS_ID_TOKEN_REQUEST_URL": "https://pipelines.example/token?api-version=2.0",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "request-token",
}


def jwt(exp: float, jti: str) -> str:
    def encode(value: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    return f"{encode({'alg': 'RS256'})}.{encode({'exp': exp, 'jti': jti})}.sig"


class Clock:
    def __init__(self, now: float) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def test_github_token_is_requested_for_phaseo_and_reused_until_near_expiry():
    clock = Clock(1_800_000_000)
    tokens = [jwt(clock.now + 600, "a"), jwt(clock.now + 1200, "b")]
    calls: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"value": tokens[len(calls) - 1]})

    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        provider = github_actions_token(http_client=http, env=GITHUB_ENV, clock=clock)
        assert provider() == tokens[0]
        assert provider() == tokens[0]
        assert len(calls) == 1
        assert str(calls[0].url) == "https://pipelines.example/token?api-version=2.0&audience=https%3A%2F%2Fapi.phaseo.app"
        assert calls[0].headers["authorization"] == "bearer request-token"

        clock.now += 541
        assert provider() == tokens[1]
        assert len(calls) == 2


def test_github_token_without_expiry_is_not_cached():
    calls: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"value": "opaque"})

    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        provider = github_actions_token(http_client=http, env={**GITHUB_ENV, "ACTIONS_ID_TOKEN_REQUEST_URL": "https://pipelines.example/token"})
        provider()
        provider()
    assert len(calls) == 2
    assert str(calls[0].url) == "https://pipelines.example/token?audience=https%3A%2F%2Fapi.phaseo.app"


def test_github_token_explains_missing_permission_and_failed_requests():
    with pytest.raises(RuntimeError, match="id-token: write"):
        github_actions_token(env={})()
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(403))) as http:
        with pytest.raises(RuntimeError, match="HTTP 403"):
            github_actions_token(http_client=http, env=GITHUB_ENV)()


def test_vercel_token_is_exchanged_and_cached_until_near_expiry():
    clock = Clock(1_800_000_000)
    bodies: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://oidc.vercel.com/~token"
        assert request.headers["content-type"] == "application/json"
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"token": f"phaseo-{len(bodies)}", "expiry": clock.now + 600})

    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        provider = vercel_token(http_client=http, env={"VERCEL_OIDC_TOKEN": " deployment "}, clock=clock)
        assert provider() == "phaseo-1"
        assert provider() == "phaseo-1"
        assert bodies == [{"token": "deployment", "aud": "https://api.phaseo.app"}]
        clock.now += 541
        assert provider() == "phaseo-2"


def test_vercel_token_prefers_the_token_file_and_an_explicit_source(tmp_path):
    token_file = tmp_path / "token"
    token_file.write_text("from-file\n")
    sources: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        sources.append(json.loads(request.content)["token"])
        return httpx.Response(200, json={"token": "phaseo"})

    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        vercel_token(http_client=http, env={"VERCEL_OIDC_TOKEN_FILE": str(token_file), "VERCEL_OIDC_TOKEN": "from-env"})()
        vercel_token(http_client=http, token=lambda: "from-header", env={"VERCEL_OIDC_TOKEN": "from-env"})()
    assert sources == ["from-file", "from-header"]


def test_vercel_token_surfaces_errors():
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(400, json={"error": "invalid audience"}))) as http:
        with pytest.raises(RuntimeError, match="Vercel OIDC token exchange failed: invalid audience"):
            vercel_token(http_client=http, token="deployment")()
    with pytest.raises(RuntimeError, match="VERCEL_OIDC_TOKEN"):
        vercel_token(env={})()


def test_vercel_token_works_as_the_clients_api_key():
    seen: list[str | None] = []

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oidc.vercel.com":
            return httpx.Response(200, json={"token": "phaseo-token"})
        seen.append(request.headers.get("authorization"))
        return httpx.Response(200, json={"data": {"id": "key_123"}})

    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        client = Phaseo(api_key=vercel_token(http_client=http, token="deployment"), base_url="https://example.test/v1", http_client=http)
        client.get_current_api_key()
    assert seen == ["Bearer phaseo-token"]
