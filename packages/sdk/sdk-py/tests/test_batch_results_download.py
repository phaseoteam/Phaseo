from email.message import Message
from io import BytesIO
from unittest.mock import patch

import pytest
import httpx
from phaseo import Phaseo

from gen.client import Client
from gen.operations import retrieveBatchResults


def test_stream_results_yields_before_completion_and_closes(monkeypatch):
    class Chunks(httpx.SyncByteStream):
        closed = False
        reads = 0

        def __iter__(self):
            for chunk in [b'{"custom_id":"one"}\n', b'{"custom_id":"two"}\n']:
                self.reads += 1
                yield chunk

        def close(self):
            self.closed = True

    chunks = Chunks()

    def handle(request):
        assert str(request.url) == "https://example.test/v1/batches/batch%201/results"
        assert request.headers["Authorization"] == "Bearer sk_test"
        return httpx.Response(200, stream=chunks)

    with httpx.Client(transport=httpx.MockTransport(handle)) as transport:
        monkeypatch.setattr(httpx, "stream", transport.stream)
        client = Phaseo(api_key="sk_test", base_url="https://example.test/v1")
        result = client.batches.stream_results("batch 1")
        assert next(result) == b'{"custom_id":"one"}\n'
        assert chunks.reads == 1
        result.close()
        assert chunks.closed


@pytest.mark.parametrize("jsonl", ["", '{"custom_id":"one"}\n', '{"custom_id":"one"}\n{"custom_id":"two"}\n'])
def test_download_preserves_jsonl(jsonl):
    response = BytesIO(jsonl.encode())
    response.headers = Message()
    response.headers["Content-Type"] = "application/x-ndjson; charset=utf-8"
    with patch("urllib.request.urlopen", return_value=response) as fetch:
        client = Client("https://example.test/v1", {"Authorization": "Bearer test-key"})
        assert retrieveBatchResults(client, path={"batch_id": "batch_123"}) == jsonl
        request = fetch.call_args.args[0]
        assert request.full_url == "https://example.test/v1/batches/batch_123/results"
        assert request.get_header("Authorization") == "Bearer test-key"
