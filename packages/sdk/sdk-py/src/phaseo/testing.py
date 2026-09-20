"""Strict fixture transport for local application tests, with no network fallback."""
from __future__ import annotations

from typing import Any
import httpx


class MockTransport(httpx.MockTransport):
    def __init__(self, fixtures: list[dict[str, Any]]):
        self.fixtures = list(fixtures)
        self.requests: list[httpx.Request] = []
        super().__init__(self._handle)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        if not self.fixtures:
            raise AssertionError(f"Unexpected mock request: {request.method} {request.url.path}")
        fixture = self.fixtures.pop(0)
        assert request.method == fixture["method"].upper(), "Mock HTTP method mismatch"
        assert request.url.raw_path.decode().split("?", 1)[0] == fixture["path"], "Mock HTTP path mismatch"
        self.requests.append(request)
        payload = {"content": fixture["body"]} if "body" in fixture else {"json": fixture["json"]} if "json" in fixture else {"content": b""}
        return httpx.Response(fixture.get("status", 200), headers=fixture.get("headers"), **payload)

    def assert_done(self) -> None:
        assert not self.fixtures, f"{len(self.fixtures)} mock requests unused"


def job_fixtures(path: str, job_id: str, outcome: str = "completed") -> list[dict[str, Any]]:
    from urllib.parse import quote
    return [
        {"method": "POST", "path": path, "json": {"id": job_id, "status": "queued"}},
        {"method": "GET", "path": f"{path}/{quote(job_id, safe='')}", "json": {"id": job_id, "status": "running"}},
        {"method": "GET", "path": f"{path}/{quote(job_id, safe='')}", "json": {"id": job_id, "status": outcome}},
    ]
