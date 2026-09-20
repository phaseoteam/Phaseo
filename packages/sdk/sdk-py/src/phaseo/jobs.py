"""Handwritten polling helpers shared by music, video, and batches."""
from __future__ import annotations

import math
import time
from threading import Event
from typing import Any, Callable, Literal
from typing_extensions import TypedDict, Unpack

JobKind = Literal["music", "video", "batch"]
JobResponse = dict[str, Any]


class JobHandle:
    def __init__(self, kind: JobKind, job_id: str, retrieve: Callable[[str], JobResponse],
                 initial: JobResponse | None = None, cancel: Callable[[str], JobResponse] | None = None):
        if not job_id.strip():
            raise ValueError("Job ID is required")
        self.kind, self.id, self._retrieve, self._initial, self._cancel = kind, job_id, retrieve, initial, cancel

    def to_dict(self) -> dict[str, str]:
        return {"kind": self.kind, "id": self.id}

    def result(self, **options: Unpack[JobWaitOptions]) -> JobResponse:
        response = wait_for_job(self.kind, self.id, self._retrieve, initial=self._initial, **options)
        if job_status(response) != "completed":
            raise JobFailedError(self.kind, response)
        return response

    def cancel(self) -> JobResponse:
        if self._cancel is None:
            raise NotImplementedError(f"Remote cancellation is not supported for {self.kind}")
        return self._cancel(self.id)

    def events(self, *, interval: float = 5, timeout: float = 1800):
        _validate_options({"interval": interval, "timeout": timeout})
        deadline = time.monotonic() + timeout
        last = self._initial
        initial = self._initial
        while True:
            if time.monotonic() >= deadline:
                raise JobTimeoutError(self.kind, self.id, last)
            last = initial if initial is not None else self._retrieve(self.id)
            initial = None
            if time.monotonic() >= deadline:
                raise JobTimeoutError(self.kind, self.id, last)
            yield last
            if job_status(last) in ("completed", "failed", "cancelled", "expired"):
                return
            time.sleep(min(max(.25, interval), max(0, deadline - time.monotonic())))


class JobWaitOptions(TypedDict, total=False):
    interval: float
    timeout: float
    on_poll: Callable[[JobResponse], None]
    cancel_event: Event


class JobTimeoutError(TimeoutError):
    def __init__(self, kind: JobKind, job_id: str, last_response: JobResponse | None):
        super().__init__(f"Timed out waiting for {kind} {job_id}")
        self.kind = kind
        self.job_id = job_id
        self.last_response = last_response


class JobCancelledError(Exception):
    """The local wait was cancelled; the remote job was not cancelled."""

    def __init__(self, kind: JobKind, job_id: str, last_response: JobResponse | None):
        super().__init__(f"Stopped waiting for {kind} {job_id}")
        self.kind = kind
        self.job_id = job_id
        self.last_response = last_response


class JobFailedError(Exception):
    def __init__(self, kind: JobKind, response: JobResponse):
        super().__init__(f"{kind} {response.get('id', '')} finished with status {job_status(response)}")
        self.kind = kind
        self.job_id = response.get("id")
        self.response = response


def job_status(job: JobResponse) -> str:
    status = str(job.get("status") or job.get("lifecycle_status") or "").strip().lower()
    return "cancelled" if status == "canceled" else status


def _validate_options(options: JobWaitOptions) -> None:
    for name in ("interval", "timeout"):
        value = options.get(name)
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0):
            raise ValueError(f"{name} must be a finite positive number")


def wait_for_job(
    kind: JobKind,
    job_id: str,
    retrieve: Callable[[str], JobResponse],
    *,
    initial: JobResponse | None = None,
    **options: Unpack[JobWaitOptions],
) -> JobResponse:
    """Return a terminal response, including failures. Check deadlines between HTTP calls."""
    _validate_options(options)
    job_id = job_id.strip()
    if not job_id:
        raise ValueError(f"{kind} ID is required")
    interval = max(0.25, options.get("interval", 5.0))
    deadline = time.monotonic() + options.get("timeout", 1800.0)
    cancel_event = options.get("cancel_event")
    last = initial

    def check_stopped() -> None:
        if cancel_event is not None and cancel_event.is_set():
            raise JobCancelledError(kind, job_id, last)
        if time.monotonic() >= deadline:
            raise JobTimeoutError(kind, job_id, last)

    while True:
        check_stopped()
        last = initial if initial is not None else retrieve(job_id)
        initial = None
        check_stopped()
        on_poll = options.get("on_poll")
        if on_poll is not None:
            on_poll(last)
        check_stopped()
        if job_status(last) in ("completed", "failed", "cancelled", "expired"):
            return last
        delay = min(interval, max(0, deadline - time.monotonic()))
        if cancel_event is not None:
            cancel_event.wait(delay)
        else:
            time.sleep(delay)


def create_and_wait_for_job(
    kind: JobKind,
    create: Callable[[], JobResponse],
    retrieve: Callable[[str], JobResponse],
    **options: Unpack[JobWaitOptions],
) -> JobResponse:
    """Submit once. The waiting deadline starts after the submission returns."""
    _validate_options(options)
    cancel_event = options.get("cancel_event")
    if cancel_event is not None and cancel_event.is_set():
        raise JobCancelledError(kind, "", None)
    initial = create()
    result = wait_for_job(kind, str(initial.get("id") or ""), retrieve, initial=initial, **options)
    if job_status(result) != "completed":
        raise JobFailedError(kind, result)
    return result
