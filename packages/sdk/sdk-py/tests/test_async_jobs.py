from phaseo import Phaseo


def test_get_async_job_websocket_url_builds_expected_url():
    client = Phaseo(api_key="sk_test_123", base_url="https://example.test/v1")

    assert client.get_async_job_websocket_url(
        "batch",
        "batch 123",
        interval_ms=1500,
        close_on_terminal=False,
    ) == "wss://example.test/v1/async/batch/batch%20123/ws?interval_ms=1500&close_on_terminal=false"


def test_async_job_resource_shortcuts_delegate_to_helper():
    client = Phaseo(api_key="sk_test_123", base_url="http://localhost:8787/v1")

    assert client.batches.websocket_url("batch_123") == "ws://localhost:8787/v1/async/batch/batch_123/ws"
    assert (
        client.videos.websocket_url("video_123", close_on_terminal=True)
        == "ws://localhost:8787/v1/async/video/video_123/ws?close_on_terminal=true"
    )
    assert client.async_jobs.websocket_url("video", "video_123") == "ws://localhost:8787/v1/async/video/video_123/ws"
