import asyncio

import httpx

from phaseo import AsyncPhaseo, Phaseo


def handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/extractions"
    assert request.method == "POST"
    return httpx.Response(200, json={
        "model": "cloudflare/clairic",
        "answers": {"po": {"type": "text", "value": None, "confidence": 0.98, "p_null": 0.99}},
        "truncated": False,
        "usage": {"input_tokens": 12, "output_tokens": 0, "total_tokens": 12},
    })


PARAMS = {"model": "cloudflare/clairic", "input": "No purchase order", "fields": {"po": {"type": "text"}}}


def test_extraction_sync_preserves_null_and_uncertainty():
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        client = Phaseo(api_key="test", base_url="https://example.test", http_client=http)
        result = client.extractions.create(PARAMS)
        assert result["answers"]["po"]["value"] is None
        assert result["answers"]["po"]["p_null"] == 0.99


def test_extraction_async_preserves_null_and_uncertainty():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = AsyncPhaseo(api_key="test", base_url="https://example.test", http_client=http)
            result = await client.extractions.create(PARAMS)
            assert result["answers"]["po"]["value"] is None
            assert result["usage"]["output_tokens"] == 0
    asyncio.run(run())
