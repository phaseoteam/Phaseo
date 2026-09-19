import { afterEach, describe, expect, test, vi } from "vitest";
import { Phaseo, JobFailedError, JobTimeoutError, JobCancelledError } from "../src/index.js";

afterEach(() => vi.useRealTimers());

function setup(responses: unknown[]) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(responses.shift()), {
    headers: { "Content-Type": "application/json" },
  }));
  const client = new Phaseo({ apiKey: "test", baseUrl: "https://example.test/v1", fetchImpl });
  // Lifecycle lookup is separately tested; don't add unrelated HTTP requests here.
  vi.spyOn(client as any, "withLifecycleGuard").mockImplementation((_req: unknown, run: () => unknown) => run());
  return { client, fetchImpl };
}

describe("generation lifecycle conveniences", () => {
  test.each(["music", "video", "batch"] as const)("%s returns inline completion without polling", async (kind) => {
    const output = { id: "job_1", status: "completed", output: [{ audio_url: "https://asset.test/song" }], billing: { state: "settled" } };
    const { client, fetchImpl } = setup([output]);
    const result = kind === "music" ? await client.music.generateAndWait({ model: "test", prompt: "song" })
      : kind === "video" ? await client.videos.generateAndWait({ model: "test", prompt: "clip" })
      : await client.batches.createAndWait({ model: "test" } as any);
    expect(result).toEqual(output);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test.each(["music", "video", "batch"] as const)("%s submits once and polls until completed", async (kind) => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup([
      { id: "job_1", status: "queued" }, { id: "job_1", status: "in_progress" },
      { id: "job_1", status: "completed", usage: { requests: 1 } },
    ]);
    const onPoll = vi.fn();
    const options = { intervalMs: 250, onPoll };
    const pending = kind === "music" ? client.music.generateAndWait({ model: "test", prompt: "song" }, options)
      : kind === "video" ? client.videos.generateAndWait({ model: "test", prompt: "clip" }, options)
      : client.batches.createAndWait({ model: "test" } as any, options);
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).status).toBe("completed");
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map((call) => call[1].method)).toEqual(["POST", "GET", "GET"]);
    const path = kind === "music" ? "music/generate" : kind === "video" ? "videos" : "batches";
    expect(calls[1][0]).toBe(`https://example.test/v1/${path}/job_1`);
    expect(onPoll.mock.calls.map(([job]) => job.status)).toEqual(["queued", "in_progress", "completed"]);
  });

  test.each(["failed", "cancelled", "expired"])("submit-and-wait raises a structured %s error", async (status) => {
    const response = { id: "job_1", status, error: { message: "Provider error" } };
    const { client } = setup([response]);
    await expect(client.videos.generateAndWait({ model: "test", prompt: "clip" })).rejects.toMatchObject({
      name: "JobFailedError", jobId: "job_1", response,
    });
  });

  test("wait returns failed jobs for inspection and never resubmits", async () => {
    const { client, fetchImpl } = setup([{ id: "job_1", status: "failed" }]);
    expect((await client.music.wait("job_1")).status).toBe("failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("timeout retains the ID and last response, with no further polling", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup([{ id: "job_1", status: "queued" }]);
    const result = client.music.wait("job_1", { timeoutMs: 100, intervalMs: 250 }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await result;
    expect(error).toBeInstanceOf(JobTimeoutError);
    expect(error.jobId).toBe("job_1");
    expect(error.lastResponse.status).toBe("queued");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("timeout also bounds a stuck status request", async () => {
    vi.useFakeTimers();
    const { client } = setup([]);
    vi.spyOn(client, "getVideo").mockReturnValue(new Promise(() => {}));
    const result = client.videos.wait("job_1", { timeoutMs: 100 }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBeInstanceOf(JobTimeoutError);
  });

  test("local abort preserves the job and does not send remote cancellation", async () => {
    const { client, fetchImpl } = setup([{ id: "job_1", status: "queued" }]);
    const controller = new AbortController();
    const result = client.videos.wait("job_1", {
      signal: controller.signal, onPoll: () => { controller.abort(); },
    }).catch((error) => error);
    expect(await result).toBeInstanceOf(JobCancelledError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("pre-aborted or invalid waits never submit a paid generation", async () => {
    const { client, fetchImpl } = setup([]);
    await expect(client.music.generateAndWait({ model: "test", prompt: "song" }, { timeoutMs: NaN })).rejects.toThrow("finite positive");
    await expect(client.music.generateAndWait({ model: "test", prompt: "song" }, { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("HTTP errors propagate without retrying submission", async () => {
    const { client, fetchImpl } = setup([]);
    fetchImpl.mockImplementation(async () => new Response(JSON.stringify({ error: "quota" }), { status: 429 }));
    await expect(client.music.generateAndWait({ model: "test", prompt: "song" })).rejects.toMatchObject({ status: 429, body: { error: "quota" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
