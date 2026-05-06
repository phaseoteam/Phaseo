#!/usr/bin/env python3
"""
Native Gemini API Veo probe using plain requests.

Flow:
1. POST /v1beta/models/{model}:predictLongRunning with x-goog-api-key
2. Poll GET /v1beta/{operation_name} with the same x-goog-api-key

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


BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
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


def resolve_api_key() -> str:
    load_local_env()
    api_key = (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_AI_STUDIO_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )
    if not api_key:
        raise RuntimeError(
            "Missing GEMINI_API_KEY / GOOGLE_AI_STUDIO_API_KEY / GOOGLE_API_KEY in env or .env.local"
        )
    return api_key


def pretty(data: Any) -> str:
    return json.dumps(data, indent=2, sort_keys=True)


def extract_first_video_uri(payload: dict[str, Any]) -> str | None:
    candidates = [
        payload.get("response", {})
        .get("generateVideoResponse", {})
        .get("generatedSamples", [{}])[0]
        .get("video", {})
        .get("uri"),
        payload.get("response", {})
        .get("generatedVideos", [{}])[0]
        .get("video", {})
        .get("uri"),
        payload.get("response", {}).get("videos", [{}])[0].get("uri"),
        payload.get("response", {}).get("videos", [{}])[0].get("gcsUri"),
    ]
    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def submit_video(session: requests.Session, api_key: str, model: str, prompt: str) -> dict[str, Any]:
    url = f"{BASE_URL}/models/{model}:predictLongRunning"
    payload = {
        "instances": [
            {
                "prompt": prompt,
            }
        ],
        "parameters": {
            "durationSeconds": 4,
            "resolution": "720p",
        },
    }
    print(f"POST {url}")
    response = session.post(
        url,
        headers={
            "x-goog-api-key": api_key,
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
    api_key: str,
    operation_name: str,
    poll_interval: float,
    max_polls: int,
) -> dict[str, Any]:
    url = f"{BASE_URL}/{operation_name}"
    for attempt in range(1, max_polls + 1):
        print(f"GET {url} attempt={attempt}/{max_polls}")
        response = session.get(
            url,
            headers={
                "x-goog-api-key": api_key,
                "Accept": "application/json",
            },
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
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--poll-interval", type=float, default=10.0)
    parser.add_argument("--max-polls", type=int, default=6)
    args = parser.parse_args()

    if not live_run_enabled():
        print("LIVE_RUN=1 is required for gemini_veo_rest_probe.py", file=sys.stderr)
        return 2

    try:
        api_key = resolve_api_key()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 2

    session = requests.Session()

    try:
        submit_payload = submit_video(session, api_key, args.model, args.prompt)
        operation_name = submit_payload.get("name")
        if not isinstance(operation_name, str) or not operation_name.strip():
            print("Missing operation name in submit response", file=sys.stderr)
            return 3
        final_payload = poll_operation(
            session=session,
            api_key=api_key,
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
