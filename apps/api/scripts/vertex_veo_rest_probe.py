#!/usr/bin/env python3
"""
Vertex AI Veo probe using plain requests.

Flow:
1. POST /v1/projects/{project}/locations/{location}/publishers/google/models/{model}:predictLongRunning
2. POST /v1/projects/{project}/locations/{location}/publishers/google/models/{model}:fetchPredictOperation

Defaults:
- model: veo-3.1-fast-generate-preview
- duration: 4 seconds
- resolution: 720p

Safety:
- requires LIVE_RUN=1 before reading local env files or making live provider calls
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests


DEFAULT_MODEL = "veo-3.1-fast-generate-preview"
DEFAULT_PROMPT = "A cinematic slow pan across rain on a city window at night, realistic lighting, subtle motion."


def live_run_enabled() -> bool:
    value = os.getenv("LIVE_RUN", "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def load_local_env() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    candidates = [
        repo_root / ".env.local",
        repo_root / ".env",
        repo_root / "apps" / "api" / ".dev.vars",
        repo_root / "apps" / "api" / ".env.local",
        repo_root / "apps" / "api" / ".env",
    ]
    for candidate in candidates:
        load_env_file(candidate)


def resolve_project() -> str:
    load_local_env()
    value = (
        os.getenv("GOOGLE_VERTEX_PROJECT")
        or os.getenv("GOOGLE_CLOUD_PROJECT")
        or os.getenv("PROJECT_ID")
    )
    if not value:
        raise RuntimeError("Missing GOOGLE_VERTEX_PROJECT / GOOGLE_CLOUD_PROJECT / PROJECT_ID")
    return value.strip()


def resolve_location() -> str:
    load_local_env()
    value = (
        os.getenv("GOOGLE_VERTEX_LOCATION")
        or os.getenv("GOOGLE_CLOUD_LOCATION")
        or os.getenv("LOCATION")
        or "us-east5"
    )
    return value.strip()


def resolve_access_token() -> str:
    load_local_env()
    value = (
        os.getenv("GOOGLE_VERTEX_ACCESS_TOKEN")
        or os.getenv("GOOGLE_VERTEX_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )
    if not value:
        raise RuntimeError("Missing GOOGLE_VERTEX_ACCESS_TOKEN / GOOGLE_VERTEX_API_KEY / OPENAI_API_KEY")
    token = value.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        raise RuntimeError("Vertex bearer token is empty")
    return token


def resolve_base_url(project: str, location: str) -> str:
    raw_base = os.getenv("GOOGLE_VERTEX_BASE_URL", "").strip().rstrip("/")
    if raw_base:
        if raw_base.endswith(f"/projects/{project}/locations/{location}"):
            return raw_base
        if raw_base.endswith("/v1"):
            return f"{raw_base}/projects/{project}/locations/{location}"
        return f"{raw_base}/v1/projects/{project}/locations/{location}"
    return f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}"


def pretty(data: Any) -> str:
    return json.dumps(data, indent=2, sort_keys=True)


def extract_first_video_uri(payload: dict[str, Any]) -> str | None:
    candidates = [
        payload.get("response", {}).get("videos", [{}])[0].get("gcsUri"),
        payload.get("response", {}).get("videos", [{}])[0].get("uri"),
    ]
    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def submit_video(
    session: requests.Session,
    base_url: str,
    access_token: str,
    model: str,
    prompt: str,
) -> dict[str, Any]:
    url = f"{base_url}/publishers/google/models/{model}:predictLongRunning"
    payload = {
        "instances": [
            {
                "prompt": prompt,
            }
        ],
        "parameters": {
            "durationSeconds": 4,
            "resolution": "720p",
            "sampleCount": 1,
        },
    }
    print(f"POST {url}")
    response = session.post(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    print(f"submit status={response.status_code}")
    data = response.json() if response.content else {}
    print(pretty(data))
    response.raise_for_status()
    return data


def poll_operation(
    session: requests.Session,
    base_url: str,
    access_token: str,
    model: str,
    operation_name: str,
    poll_interval: float,
    max_polls: int,
) -> dict[str, Any]:
    url = f"{base_url}/publishers/google/models/{model}:fetchPredictOperation"
    for attempt in range(1, max_polls + 1):
        print(f"POST {url} attempt={attempt}/{max_polls}")
        response = session.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={"operationName": operation_name},
            timeout=60,
        )
        print(f"poll status={response.status_code}")
        data = response.json() if response.content else {}
        print(pretty(data))
        if response.status_code >= 400:
            response.raise_for_status()
        if bool(data.get("done")):
            return data
        time.sleep(poll_interval)
    raise TimeoutError(f"Operation did not complete after {max_polls} polls")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project")
    parser.add_argument("--location")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--poll-interval", type=float, default=10.0)
    parser.add_argument("--max-polls", type=int, default=6)
    args = parser.parse_args()

    if not live_run_enabled():
        print("LIVE_RUN=1 is required for vertex_veo_rest_probe.py", file=sys.stderr)
        return 2

    try:
        project = (args.project or resolve_project()).strip()
        location = (args.location or resolve_location()).strip()
        access_token = resolve_access_token()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 2

    base_url = resolve_base_url(project, location)
    session = requests.Session()

    try:
        submit_payload = submit_video(session, base_url, access_token, args.model, args.prompt)
        operation_name = submit_payload.get("name")
        if not isinstance(operation_name, str) or not operation_name.strip():
            print("Missing operation name in submit response", file=sys.stderr)
            return 3
        final_payload = poll_operation(
            session=session,
            base_url=base_url,
            access_token=access_token,
            model=args.model,
            operation_name=operation_name.strip(),
            poll_interval=args.poll_interval,
            max_polls=args.max_polls,
        )
        uri = extract_first_video_uri(final_payload)
        if uri:
            print(f"video_uri={uri}")
        else:
            print("No video URI found in final payload")
        return 0
    except requests.HTTPError as exc:
        response = exc.response
        if response is not None:
            print(f"HTTP error status={response.status_code}", file=sys.stderr)
            try:
                print(pretty(response.json()), file=sys.stderr)
            except Exception:
                print(response.text[:4000], file=sys.stderr)
        else:
            print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
