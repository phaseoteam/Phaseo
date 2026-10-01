from threading import Event
from unittest.mock import Mock

import pytest

from gen import operations as ops
from phaseo import Phaseo, JobFailedError, JobTimeoutError, JobCancelledError
from phaseo import jobs


@pytest.fixture
def clock(monkeypatch):
    now = [0.0]
    monkeypatch.setattr(jobs.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(jobs.time, "sleep", lambda delay: now.__setitem__(0, now[0] + delay))
    return now


@pytest.fixture
def client(monkeypatch):
    value = Phaseo(api_key="test", base_url="https://example.test/v1")
    monkeypatch.setattr(value, "_maybe_warn_for_payload", lambda payload: None)
    return value


@pytest.mark.parametrize("kind,create_op,get_op", [
    ("music", "generateMusic", "getMusicGeneration"),
    ("video", "createVideo", "getVideo"),
    ("batch", "createBatch", "retrieveBatch"),
])
@pytest.mark.parametrize("inline", [True, False])
def test_submit_once_and_normalize_wait(client, monkeypatch, clock, kind, create_op, get_op, inline):
    complete = {"id": "job_1", "status": "completed", "usage": {"requests": 1}, "billing": {"state": "settled"}}
    submit = Mock(return_value=complete if inline else {"id": "job_1", "status": "queued"})
    retrieve = Mock(side_effect=[{"id": "job_1", "status": "in_progress"}, complete])
    monkeypatch.setattr(ops, create_op, submit)
    monkeypatch.setattr(ops, get_op, retrieve)
    resource = getattr(client, "batches" if kind == "batch" else "videos" if kind == "video" else "music")
    method = resource.create_and_wait if kind == "batch" else resource.generate_and_wait
    observed = []
    result = method({"model": "test", "prompt": "generate"}, interval=0.25, on_poll=lambda job: observed.append(job["status"]))
    assert result == complete
    assert submit.call_count == 1
    assert retrieve.call_count == (0 if inline else 2)
    assert observed == (["completed"] if inline else ["queued", "in_progress", "completed"])


@pytest.mark.parametrize("status", ["failed", "cancelled", "expired"])
def test_failure_has_original_response_and_id(client, monkeypatch, status):
    response = {"id": "job_1", "status": status, "error": {"message": "provider error"}}
    monkeypatch.setattr(ops, "createVideo", Mock(return_value=response))
    with pytest.raises(JobFailedError) as caught:
        client.videos.generate_and_wait({"model": "test", "prompt": "clip"})
    assert caught.value.job_id == "job_1"
    assert caught.value.response is response


def test_wait_returns_failure_without_resubmitting(client, monkeypatch):
    monkeypatch.setattr(ops, "getMusicGeneration", Mock(return_value={"id": "job_1", "status": "failed"}))
    assert client.music.wait("job_1")["status"] == "failed"


def test_timeout_retains_last_response(client, monkeypatch, clock):
    retrieve = Mock(return_value={"id": "job_1", "status": "queued"})
    monkeypatch.setattr(ops, "getMusicGeneration", retrieve)
    with pytest.raises(JobTimeoutError) as caught:
        client.music.wait("job_1", timeout=0.1, interval=0.25)
    assert caught.value.job_id == "job_1"
    assert caught.value.last_response["status"] == "queued"
    assert retrieve.call_count == 1


def test_checks_timeout_after_blocking_request(client, monkeypatch, clock):
    def slow_get(*args, **kwargs):
        clock[0] += 2
        return {"id": "job_1", "status": "completed"}
    monkeypatch.setattr(ops, "getVideo", slow_get)
    with pytest.raises(JobTimeoutError):
        client.videos.wait("job_1", timeout=1)


def test_cancellation_preserves_remote_job(client, monkeypatch):
    event = Event()
    retrieve = Mock(return_value={"id": "job_1", "status": "queued"})
    cancel = Mock()
    monkeypatch.setattr(ops, "getMusicGeneration", retrieve)
    monkeypatch.setattr(client, "cancel_video", cancel)
    with pytest.raises(JobCancelledError) as caught:
        client.music.wait("job_1", cancel_event=event, on_poll=lambda job: event.set())
    assert caught.value.job_id == "job_1"
    assert retrieve.call_count == 1
    cancel.assert_not_called()


@pytest.mark.parametrize("options", [{"timeout": 0}, {"interval": float("nan")}, {"timeout": float("inf")}])
def test_invalid_options_do_not_submit(client, monkeypatch, options):
    submit = Mock()
    monkeypatch.setattr(ops, "generateMusic", submit)
    with pytest.raises(ValueError, match="finite positive"):
        client.music.generate_and_wait({"model": "test"}, **options)
    submit.assert_not_called()


def test_pre_cancelled_wait_does_not_submit(client, monkeypatch):
    submit = Mock()
    monkeypatch.setattr(ops, "generateMusic", submit)
    event = Event()
    event.set()
    with pytest.raises(JobCancelledError):
        client.music.generate_and_wait({"model": "test"}, cancel_event=event)
    submit.assert_not_called()


def test_submission_error_is_not_retried(client, monkeypatch):
    error = RuntimeError("upstream connection failed")
    submit = Mock(side_effect=error)
    monkeypatch.setattr(ops, "generateMusic", submit)
    with pytest.raises(RuntimeError) as caught:
        client.music.generate_and_wait({"model": "test"})
    assert caught.value is error
    assert submit.call_count == 1


def test_music_retrieval_uses_generated_operation_and_escapes_id(client, monkeypatch):
    retrieve = Mock(return_value={"id": "a/b", "status": "completed"})
    monkeypatch.setattr(ops, "getMusicGeneration", retrieve)
    client.music.retrieve("a/b")
    assert retrieve.call_args.kwargs["path"] == {"music_id": "a%2Fb"}
