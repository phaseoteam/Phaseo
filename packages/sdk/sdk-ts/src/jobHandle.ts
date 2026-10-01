import { JobFailedError, JobTimeoutError, jobStatus, type JobKind, type JobSnapshot, type JobWaitOptions, validateWaitOptions, waitForJob } from "./jobs.js";

/** Keep kind/id in durable storage and recreate a handle with the resource's resume method. */
export class JobHandle<T extends JobSnapshot> {
  constructor(
    readonly kind: JobKind,
    readonly id: string,
    private readonly retrieve: (signal?: AbortSignal, timeoutMs?: number) => Promise<T>,
    private readonly wait: (options?: JobWaitOptions<T>) => Promise<T>,
    private readonly initial?: T,
    private readonly cancelRemote?: () => Promise<T>,
  ) { if (!id.trim()) throw new Error("Job ID is required"); }

  toJSON(): { kind: JobKind; id: string } { return { kind: this.kind, id: this.id }; }
  async result(options: JobWaitOptions<T> = {}): Promise<T> {
    const response = this.initial
      ? await waitForJob(this.kind, this.id, (_id, signal) => this.retrieve(signal), options, this.initial)
      : await this.wait(options);
    if (jobStatus(response) !== "completed") throw new JobFailedError(this.kind, response as never);
    return response;
  }
  cancel(): Promise<T> {
    if (!this.cancelRemote) throw new Error(`Remote cancellation is not supported for ${this.kind}`);
    return this.cancelRemote();
  }
  async *events(options: JobWaitOptions<T> = {}): AsyncGenerator<T> {
    validateWaitOptions(options);
    const deadline = performance.now() + (options.timeoutMs ?? 1_800_000);
    let snapshot = this.initial;
    while (true) {
      options.signal?.throwIfAborted();
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new JobTimeoutError(this.kind, this.id, snapshot);
      snapshot = snapshot ?? await this.retrieve(options.signal, remaining);
      yield snapshot;
      if (["completed", "failed", "cancelled", "expired"].includes(jobStatus(snapshot))) return;
      const pause = Math.min(Math.max(250, options.intervalMs ?? 5000), deadline - performance.now());
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); reject(options.signal?.reason); };
        const timer = setTimeout(() => { options.signal?.removeEventListener("abort", abort); resolve(); }, Math.max(0, pause));
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted) abort();
      });
      snapshot = undefined;
    }
  }
}
