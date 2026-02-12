from __future__ import annotations

import json
import os
import platform
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Mapping, MutableMapping, Optional

SDK_VERSION = "1.0.0"
SDK_NAME = "python"


def _env_enabled(default: bool) -> bool:
    raw = os.getenv("AI_STATS_DEVTOOLS")
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def create_ai_stats_devtools(
    *,
    enabled: bool = True,
    directory: Optional[str] = None,
    capture_headers: bool = False,
    save_assets: bool = True,
) -> Dict[str, Any]:
    return {
        "enabled": enabled,
        "directory": directory,
        "capture_headers": capture_headers,
        "save_assets": save_assets,
    }


class TelemetryRecorder:
    def __init__(self, config: Optional[Mapping[str, Any]] = None) -> None:
        raw = dict(config or {})
        default_enabled = False
        self._enabled = _env_enabled(bool(raw.get("enabled", default_enabled)))
        directory = raw.get("directory") or os.getenv("AI_STATS_DEVTOOLS_DIR") or ".ai-stats-devtools"
        self._directory = Path(directory)
        self._capture_headers = bool(raw.get("capture_headers", False))
        self._save_assets = bool(raw.get("save_assets", True))
        self._generations_file = self._directory / "generations.jsonl"
        self._metadata_file = self._directory / "metadata.json"

        if self._enabled:
            self._ensure_layout()
            self._write_metadata()

    @property
    def enabled(self) -> bool:
        return self._enabled

    def capture_success(
        self,
        *,
        endpoint: str,
        request: Mapping[str, Any],
        response: Any,
        duration_ms: float,
        stream: bool = False,
        chunk_count: Optional[int] = None,
        status_code: Optional[int] = None,
    ) -> None:
        if not self._enabled:
            return
        entry = self._base_entry(
            endpoint=endpoint,
            request=request,
            duration_ms=duration_ms,
            stream=stream,
            chunk_count=chunk_count,
            status_code=status_code,
        )
        entry["response"] = response
        entry["error"] = None
        self._append_entry(entry)

    def capture_error(
        self,
        *,
        endpoint: str,
        request: Mapping[str, Any],
        error: Exception,
        duration_ms: float,
        stream: bool = False,
        chunk_count: Optional[int] = None,
        status_code: Optional[int] = None,
    ) -> None:
        if not self._enabled:
            return
        entry = self._base_entry(
            endpoint=endpoint,
            request=request,
            duration_ms=duration_ms,
            stream=stream,
            chunk_count=chunk_count,
            status_code=status_code,
        )
        entry["response"] = None
        entry["error"] = {
            "message": str(error),
            "type": error.__class__.__name__,
        }
        self._append_entry(entry)

    def _base_entry(
        self,
        *,
        endpoint: str,
        request: Mapping[str, Any],
        duration_ms: float,
        stream: bool,
        chunk_count: Optional[int],
        status_code: Optional[int],
    ) -> Dict[str, Any]:
        return {
            "id": str(uuid.uuid4()),
            "type": endpoint,
            "timestamp": int(time.time() * 1000),
            "duration_ms": int(duration_ms),
            "request": dict(request),
            "metadata": {
                "sdk": SDK_NAME,
                "sdk_version": SDK_VERSION,
                "stream": stream,
                "chunk_count": chunk_count,
                "status_code": status_code,
            },
        }

    def _append_entry(self, entry: MutableMapping[str, Any]) -> None:
        usage = self._extract_usage(entry.get("response"))
        if usage:
            entry["metadata"]["usage"] = usage
        model, provider = self._extract_model_provider(entry.get("response"), entry.get("request"))
        if model:
            entry["metadata"]["model"] = model
        if provider:
            entry["metadata"]["provider"] = provider

        if not self._capture_headers and isinstance(entry.get("metadata"), dict):
            entry["metadata"].pop("headers", None)

        self._ensure_layout()
        line = json.dumps(entry, ensure_ascii=False, default=str)
        with self._generations_file.open("a", encoding="utf-8") as f:
            f.write(line + "\n")

    def _ensure_layout(self) -> None:
        self._directory.mkdir(parents=True, exist_ok=True)
        if self._save_assets:
            assets = self._directory / "assets"
            (assets / "images").mkdir(parents=True, exist_ok=True)
            (assets / "audio").mkdir(parents=True, exist_ok=True)
            (assets / "video").mkdir(parents=True, exist_ok=True)

    def _write_metadata(self) -> None:
        if self._metadata_file.exists():
            return
        payload = {
            "session_id": str(uuid.uuid4()),
            "started_at": int(time.time() * 1000),
            "sdk": SDK_NAME,
            "sdk_version": SDK_VERSION,
            "platform": platform.platform(),
            "python_version": sys.version.split()[0],
        }
        with self._metadata_file.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def _extract_usage(self, response: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(response, Mapping):
            return None
        usage = response.get("usage")
        if not isinstance(usage, Mapping):
            return None
        prompt = usage.get("prompt_tokens") or usage.get("input_tokens")
        completion = usage.get("completion_tokens") or usage.get("output_tokens")
        total = usage.get("total_tokens")
        return {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": total,
        }

    def _extract_model_provider(
        self, response: Any, request: Any
    ) -> tuple[Optional[str], Optional[str]]:
        model: Optional[str] = None
        provider: Optional[str] = None
        if isinstance(response, Mapping):
            model = response.get("model") if isinstance(response.get("model"), str) else None
            provider = response.get("provider") if isinstance(response.get("provider"), str) else None
        if not model and isinstance(request, Mapping):
            model = request.get("model") if isinstance(request.get("model"), str) else None
        return model, provider
