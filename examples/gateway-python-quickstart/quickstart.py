#!/usr/bin/env python3
"""
Phaseo Gateway Python Quickstart

Standard-library-only reference CLI for control + generation surfaces.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple


def load_local_env() -> None:
    env_path = pathlib.Path(".env.local")
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


load_local_env()

BASE_URL = os.getenv("PHASEO_BASE_URL") or "https://api.phaseo.app/v1".rstrip("/")
API_KEY = os.getenv("PHASEO_API_KEY") or ""
DEFAULT_MODEL = os.getenv("PHASEO_MODEL") or "openai/gpt-5.6-sol"
APP_TITLE = os.getenv("PHASEO_APP_TITLE") or os.getenv("PHASEO_APP_TITLE") or "Phaseo Python Quickstart"
HTTP_REFERER = os.getenv("PHASEO_HTTP_REFERER") or os.getenv("PHASEO_HTTP_REFERER") or "http://localhost"

def gateway_request(
    method: str,
    route: str,
    body: Optional[Dict[str, Any]] = None,
    retries: int = 2,
    timeout_seconds: int = 45,
) -> Tuple[int, Any]:
    url = f"{BASE_URL}/{route.lstrip('/')}"
    encoded: Optional[bytes] = None
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "x-title": APP_TITLE,
        "http-referer": HTTP_REFERER,
        "Accept": "application/json",
    }

    if body is not None:
        encoded = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        url=url,
        data=encoded,
        headers=headers,
        method=method.upper(),
    )

    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                status = response.getcode()
                raw = response.read().decode("utf-8", errors="replace")
                if not raw:
                    return status, {}
                try:
                    return status, json.loads(raw)
                except json.JSONDecodeError:
                    return status, raw
        except urllib.error.HTTPError as error:
            status = error.code
            raw = error.read().decode("utf-8", errors="replace")
            payload: Any
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = raw or {"error": "http_error"}

            # Retry on gateway or transient upstream failures.
            if attempt < retries and (status == 429 or status >= 500):
                attempt += 1
                time.sleep(0.5 * (2 ** attempt))
                continue

            return status, payload
        except urllib.error.URLError as error:
            if attempt < retries:
                attempt += 1
                time.sleep(0.5 * (2 ** attempt))
                continue
            return 0, {"error": "network_error", "message": str(error)}


def print_result(label: str, status: int, payload: Any) -> None:
    print(f"\n=== {label} ===")
    print(f"HTTP {status}")
    if isinstance(payload, str):
        print(payload)
    else:
        print(json.dumps(payload, indent=2, ensure_ascii=True))


def run_smoke() -> int:
    checks = [
        ("Health", "GET", "health", None),
        ("Models", "GET", "models", None),
        ("Providers", "GET", "providers", None),
        (
            "Responses",
            "POST",
            "responses",
            {"model": DEFAULT_MODEL, "input": "Return exactly: smoke_ok"},
        ),
    ]

    failed = False
    for label, method, route, body in checks:
        status, payload = gateway_request(method, route, body)
        print_result(label, status, payload)
        if status < 200 or status >= 300:
            failed = True

    return 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Phaseo Gateway Python quickstart CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("smoke", help="Run control + responses smoke checks")
    sub.add_parser("health", help="GET /health")
    sub.add_parser("models", help="GET /models")
    sub.add_parser("providers", help="GET /providers")

    responses = sub.add_parser("responses", help="POST /responses")
    responses.add_argument("--model", default=DEFAULT_MODEL)
    responses.add_argument("--prompt", required=True)
    responses.add_argument("--previous-response-id", default="")

    chat = sub.add_parser("chat", help="POST /chat/completions")
    chat.add_argument("--model", default=DEFAULT_MODEL)
    chat.add_argument("--prompt", required=True)

    embeddings = sub.add_parser("embeddings", help="POST /embeddings")
    embeddings.add_argument("--model", default="google/gemini-embedding-2")
    embeddings.add_argument("--text", required=True)

    moderations = sub.add_parser("moderations", help="POST /moderations")
    moderations.add_argument("--model", default="openai/omni-moderation-latest")
    moderations.add_argument("--text", required=True)

    image = sub.add_parser("image", help="POST /images/generations")
    image.add_argument("--model", default="openai/gpt-image-2")
    image.add_argument("--prompt", required=True)

    ocr = sub.add_parser("ocr", help="POST /ocr")
    ocr.add_argument("--model", default="mistral/mistral-ocr")
    ocr.add_argument("--image-url", required=True)

    video = sub.add_parser("video-create", help="POST /videos")
    video.add_argument("--model", default="openai/sora-2")
    video.add_argument("--prompt", required=True)

    video_status = sub.add_parser("video-status", help="GET /videos/{video_id}")
    video_status.add_argument("--video-id", required=True)

    video_cancel = sub.add_parser("video-cancel", help="POST /videos/{video_id}/cancel")
    video_cancel.add_argument("--video-id", required=True)

    video_dl = sub.add_parser("video-download-url", help="POST /videos/{video_id}/download_url")
    video_dl.add_argument("--video-id", required=True)
    video_dl.add_argument("--ttl-seconds", type=int, default=300)
    video_dl.add_argument("--disposition", choices=["attachment", "inline"], default="attachment")

    music = sub.add_parser("music-create", help="POST /music/generate")
    music.add_argument("--model", default="suno/suno-v4")
    music.add_argument("--prompt", required=True)

    music_status = sub.add_parser("music-status", help="GET /music/generate/{music_id}")
    music_status.add_argument("--music-id", required=True)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not API_KEY:
        print("Missing PHASEO_API_KEY. Set it in .env.local or environment.", file=sys.stderr)
        return 1

    if args.command == "smoke":
        return run_smoke()

    if args.command == "health":
        status, payload = gateway_request("GET", "health")
        print_result("Health", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "models":
        status, payload = gateway_request("GET", "models")
        print_result("Models", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "providers":
        status, payload = gateway_request("GET", "providers")
        print_result("Providers", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "responses":
        body: Dict[str, Any] = {"model": args.model, "input": args.prompt}
        if args.previous_response_id:
            body["previous_response_id"] = args.previous_response_id
        status, payload = gateway_request("POST", "responses", body)
        print_result("Responses", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "chat":
        body = {
            "model": args.model,
            "messages": [{"role": "user", "content": args.prompt}],
        }
        status, payload = gateway_request("POST", "chat/completions", body)
        print_result("Chat Completions", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "embeddings":
        body = {"model": args.model, "input": args.text}
        status, payload = gateway_request("POST", "embeddings", body)
        print_result("Embeddings", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "moderations":
        body = {"model": args.model, "input": args.text}
        status, payload = gateway_request("POST", "moderations", body)
        print_result("Moderations", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "image":
        body = {"model": args.model, "prompt": args.prompt}
        status, payload = gateway_request("POST", "images/generations", body)
        print_result("Image Generation", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "ocr":
        body = {"model": args.model, "image_url": args.image_url}
        status, payload = gateway_request("POST", "ocr", body)
        print_result("OCR", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "video-create":
        body = {"model": args.model, "prompt": args.prompt}
        status, payload = gateway_request("POST", "videos", body)
        print_result("Video Create", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "video-status":
        status, payload = gateway_request("GET", f"videos/{args.video_id}")
        print_result("Video Status", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "video-cancel":
        status, payload = gateway_request("POST", f"videos/{args.video_id}/cancel")
        print_result("Video Cancel", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "video-download-url":
        body = {"ttl_seconds": args.ttl_seconds, "disposition": args.disposition}
        status, payload = gateway_request("POST", f"videos/{args.video_id}/download_url", body)
        print_result("Video Download URL", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "music-create":
        body = {"model": args.model, "prompt": args.prompt}
        status, payload = gateway_request("POST", "music/generate", body)
        print_result("Music Create", status, payload)
        return 0 if 200 <= status < 300 else 1

    if args.command == "music-status":
        status, payload = gateway_request("GET", f"music/generate/{args.music_id}")
        print_result("Music Status", status, payload)
        return 0 if 200 <= status < 300 else 1

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
