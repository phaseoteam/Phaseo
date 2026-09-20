import type { BatchResponse, MusicGenerateResponse, VideoStatusResponse } from "./index.js";

export type JobKind = "music" | "video" | "batch";
type JobResponses = { music: MusicGenerateResponse; video: VideoStatusResponse; batch: BatchResponse };
export type JobSnapshot = { id?: string; status?: string; lifecycle_status?: string };
export type JobWaitOptions<T> = {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onPoll?: (job: T) => void | Promise<void>;
};

export class JobTimeoutError extends Error {
  constructor(readonly kind: JobKind, readonly jobId: string, readonly lastResponse?: JobSnapshot) {
    super(`Timed out waiting for ${kind} ${jobId}`);
    this.name = "JobTimeoutError";
  }
}

export class JobFailedError<K extends JobKind = JobKind> extends Error {
  constructor(readonly kind: K, readonly response: JobResponses[K]) {
    super(`${kind} ${response.id ?? ""} finished with status ${jobStatus(response)}`);
    this.name = "JobFailedError";
  }
  get jobId(): string | undefined { return this.response.id; }
  isKind<T extends JobKind>(kind: T): this is this & JobFailedError<T> {
    return (this.kind as JobKind) === kind;
  }
}

export class JobCancelledError extends Error {
  constructor(readonly kind: JobKind, readonly jobId: string, readonly lastResponse?: JobSnapshot, cause?: unknown) {
    super(`Stopped waiting for ${kind} ${jobId}`, { cause });
    this.name = "JobCancelledError";
  }
}

export function jobStatus(job: JobSnapshot): string {
  const status = (job.status || job.lifecycle_status || "").trim().toLowerCase();
  return status === "canceled" ? "cancelled" : status;
}

const TERMINAL = ["completed", "failed", "cancelled", "expired"];

export function validateWaitOptions<T>(options: JobWaitOptions<T>): void {
  for (const [name, value] of [["intervalMs", options.intervalMs], ["timeoutMs", options.timeoutMs]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new RangeError(`${name} must be a finite positive number`);
    }
  }
}

/** Waits on an existing job. Terminal failures are returned for inspection. */
export async function waitForJob<T extends JobSnapshot>(
  kind: JobKind,
  id: string,
  retrieve: (id: string, signal?: AbortSignal) => Promise<T>,
  options: JobWaitOptions<T> = {},
  initial?: T,
  terminalStatuses: readonly string[] = TERMINAL,
): Promise<T> {
  validateWaitOptions(options);
  const jobId = id.trim();
  if (!jobId) throw new Error(`${kind} ID is required`);
  if (options.signal?.aborted) throw new JobCancelledError(kind, jobId, initial, options.signal.reason);
  if (!terminalStatuses.length) throw new Error("At least one terminal status is required");
  const intervalMs = Math.max(250, options.intervalMs ?? 5_000);
  const timeoutMs = options.timeoutMs ?? 30 * 60_000;
  let last = initial;
  const deadline = performance.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const controller = new AbortController();
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new JobTimeoutError(kind, jobId, last);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    abort = () => {
      const error = new JobCancelledError(kind, jobId, last, options.signal?.reason);
      controller.abort(error);
      reject(error);
    };
    options.signal?.addEventListener("abort", abort, { once: true });
  });
  // A user callback can abort and then throw before the next race is attached.
  void stopped.catch(() => {});
  let sleepTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    while (true) {
      if (options.signal?.aborted) throw new JobCancelledError(kind, jobId, last, options.signal.reason);
      if (performance.now() >= deadline) throw new JobTimeoutError(kind, jobId, last);
      last = initial ?? await Promise.race([retrieve(jobId, controller.signal), stopped]);
      initial = undefined;
      if (options.onPoll) await Promise.race([Promise.resolve(options.onPoll(last)), stopped]);
      if (options.signal?.aborted) throw new JobCancelledError(kind, jobId, last, options.signal.reason);
      if (performance.now() >= deadline) throw new JobTimeoutError(kind, jobId, last);
      if (terminalStatuses.includes(jobStatus(last))) return last;
      await Promise.race([
        new Promise<void>((resolve) => { sleepTimer = setTimeout(resolve, intervalMs); }),
        stopped,
      ]);
    }
  } finally {
    clearTimeout(timer);
    clearTimeout(sleepTimer);
    if (abort) options.signal?.removeEventListener("abort", abort);
  }
}

/** Submit exactly once; timeoutMs applies to waiting after submission returns. */
export async function createAndWaitForJob<K extends JobKind>(
  kind: K,
  create: () => Promise<JobResponses[K]>,
  retrieve: (id: string, signal?: AbortSignal) => Promise<JobResponses[K]>,
  options: JobWaitOptions<JobResponses[K]> = {},
): Promise<JobResponses[K]> {
  validateWaitOptions(options);
  options.signal?.throwIfAborted();
  const initial = await create();
  const result = await waitForJob(kind, initial.id ?? "", retrieve, options, initial);
  if (jobStatus(result) !== "completed") throw new JobFailedError(kind, result);
  return result;
}
