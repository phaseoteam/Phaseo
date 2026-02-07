from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional


class Client:
	def __init__(self, base_url: str, headers: Optional[Dict[str, str]] = None):
		self._base_url = base_url.rstrip('/')
		self._headers = headers or {}

	def request(
		self,
		method: str,
		path: str,
		query: Optional[Dict[str, Any]] = None,
		headers: Optional[Dict[str, str]] = None,
		body: Optional[Any] = None,
	) -> Any:
		url = f"{self._base_url}{path}"
		if query:
			url += "?" + urllib.parse.urlencode(query, doseq=True)
		payload = None
		request_headers = {"Accept": "application/json", **self._headers, **(headers or {})}
		if body is not None:
			payload = json.dumps(body).encode("utf-8")
			request_headers["Content-Type"] = "application/json"
		req = urllib.request.Request(url, data=payload, headers=request_headers, method=method.upper())
		with urllib.request.urlopen(req) as resp:
			raw = resp.read().decode("utf-8")
			if not raw:
				return None
			try:
				return json.loads(raw)
			except json.JSONDecodeError:
				return raw
