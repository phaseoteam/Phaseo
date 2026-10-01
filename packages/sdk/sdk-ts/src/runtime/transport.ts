export type RequestControls = {
  signal?: AbortSignal;
  /** Deadline for each HTTP request, including consuming its response body. */
  timeoutMs?: number;
  /** Retries for GET/HEAD only. Submissions are never retried. */
  maxRetries?: number;
  /** Sent as Idempotency-Key. Write requests are still never retried automatically. */
  idempotencyKey?: string;
  onRequest?: (event: RequestEvent) => void;
  onResponse?: (event: ResponseEvent) => void;
  onRetry?: (event: RetryEvent) => void;
};

export type RequestEvent = { method: string; attempt: number };
export type ResponseEvent = RequestEvent & { status: number; headers: Headers };
export type RetryEvent = RequestEvent & { status?: number; delayMs: number; error?: unknown };

export class RequestTimeoutError extends Error {
  constructor() { super("Phaseo request timed out"); this.name = "RequestTimeoutError"; }
}

export function requestTraceUrl(requestId: string): string {
  return `https://phaseo.app/settings/usage/logs/requests/${encodeURIComponent(requestId)}`;
}

export type ResponseMetadata = { requestId?: string; traceUrl?: string; status: number };
const metadata = new WeakMap<object, ResponseMetadata>();
export function responseMetadata(value: object): ResponseMetadata | undefined { return metadata.get(value); }
export function trackResponse<T>(value: T, response: Response): T {
  if (value && typeof value === "object") {
    const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-phaseo-request-id") ?? undefined;
    metadata.set(value, { requestId, traceUrl: requestId ? requestTraceUrl(requestId) : undefined, status: response.status });
  }
  return value;
}

/** One transport for generated operations, SSE and binary media. */
export function createTransport(fetchImpl: typeof fetch, controls: RequestControls = {}): typeof fetch {
  const timeoutMs = controls.timeoutMs ?? 60_000;
  const maxRetries = controls.maxRetries ?? 0;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("timeoutMs must be positive");
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) throw new RangeError("maxRetries must be between 0 and 10");
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const controller = new AbortController();
    const signals = [controls.signal, init.signal, input instanceof Request ? input.signal : undefined].filter(Boolean) as AbortSignal[];
    const abort = () => controller.abort(signals.find(s => s.aborted)?.reason);
    for (const signal of signals) signal.addEventListener("abort", abort, { once: true });
    if (signals.some(s => s.aborted)) abort();
    const timer = setTimeout(() => controller.abort(new RequestTimeoutError()), timeoutMs);
    const cleanup = () => { clearTimeout(timer); for (const signal of signals) signal.removeEventListener("abort", abort); };
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const retries = ["GET", "HEAD"].includes(method) ? maxRetries : 0;
    let requestHeaders = init.headers;
    if (controls.idempotencyKey) {
      if (requestHeaders && !(requestHeaders instanceof Headers) && !Array.isArray(requestHeaders)) {
        requestHeaders = { ...requestHeaders, "Idempotency-Key": controls.idempotencyKey };
      } else {
        const merged = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(requestHeaders).forEach((value, key) => merged.set(key, value));
        merged.set("Idempotency-Key", controls.idempotencyKey);
        requestHeaders = merged;
      }
    }
    try {
      for (let attempt = 0; ; attempt++) {
        controller.signal.throwIfAborted();
        controls.onRequest?.({ method, attempt });
        let response: Response;
        try { response = await fetchImpl(input, { ...init, headers: requestHeaders, signal: controller.signal }); }
        catch (error) {
          controller.signal.throwIfAborted();
          if (attempt >= retries || !(error instanceof TypeError)) throw error;
          const delayMs = Math.min(250 * 2 ** attempt, 5000);
          controls.onRetry?.({ method, attempt: attempt + 1, delayMs, error });
          await delay(delayMs, controller.signal);
          continue;
        }
        if ([408, 429, 500, 502, 503, 504].includes(response.status) && attempt < retries) {
          const retryAfter = response.headers.get("retry-after");
          const seconds = retryAfter === null ? NaN : Number(retryAfter);
          const wait = Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
            : retryAfter && Number.isFinite(Date.parse(retryAfter)) ? Math.max(0, Date.parse(retryAfter) - Date.now()) : Math.min(250 * 2 ** attempt, 5000);
          await response.body?.cancel();
          controls.onRetry?.({ method, attempt: attempt + 1, status: response.status, delayMs: wait });
          await delay(wait, controller.signal);
          continue;
        }
        controls.onResponse?.({ method, attempt, status: response.status, headers: response.headers });
        if (!response.body) { cleanup(); return response; }
        const reader = response.body.getReader();
        let streamController: ReadableStreamDefaultController<Uint8Array>;
        const onAbort = () => { void reader.cancel(controller.signal.reason).catch(() => {}); streamController.error(controller.signal.reason); cleanup(); };
        const finish = () => { controller.signal.removeEventListener("abort", onAbort); cleanup(); };
        const body = new ReadableStream<Uint8Array>({
          start(c) { streamController = c; controller.signal.addEventListener("abort", onAbort, { once: true }); },
          async pull(c) {
            try {
              controller.signal.throwIfAborted();
              const next = await reader.read();
              if (next.done) { finish(); c.close(); } else c.enqueue(next.value);
            } catch (error) { finish(); c.error(controller.signal.aborted ? controller.signal.reason : error); }
          },
          async cancel(reason) { finish(); await reader.cancel(reason); },
        });
        const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
        const json = wrapped.json.bind(wrapped);
        wrapped.json = async () => trackResponse(await json(), wrapped);
        return wrapped;
      }
    } catch (error) { cleanup(); throw controller.signal.aborted ? controller.signal.reason : error; }
  }) as typeof fetch;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
