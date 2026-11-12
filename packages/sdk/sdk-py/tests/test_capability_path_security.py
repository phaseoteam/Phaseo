import asyncio
import httpx
import pytest
from phaseo import Phaseo, AsyncPhaseo

@pytest.mark.parametrize("model_id", ["../..", "author/.", "./model"])
def test_capability_dot_segments_never_reach_transport(model_id):
    requests = []
    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"endpoints": []})
    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        client = Phaseo(api_key="test", base_url="https://example.test/v1", http_client=http)
        with pytest.raises(ValueError):
            client.get_model_endpoint_capabilities(model_id)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
            client = AsyncPhaseo(api_key="test", base_url="https://example.test/v1", http_client=http)
            with pytest.raises(ValueError):
                await client.get_model_endpoint_capabilities(model_id)
    asyncio.run(run())
    assert requests == []

def test_capability_delimiters_stay_inside_the_model_segment():
    def handle(request):
        assert request.url.raw_path == b"/v1/models/author/model.1%3Fx%23fragment/endpoints"
        return httpx.Response(200, json={"endpoints": []})
    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        client = Phaseo(api_key="test", base_url="https://example.test/v1", http_client=http)
        client.get_model_endpoint_capabilities("author/model.1?x#fragment")
