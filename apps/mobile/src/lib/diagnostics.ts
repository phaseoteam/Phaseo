/**
 * Slow operations for Account → Diagnostics: the latest work that took at least SLOW_MS (opening a chat, loading a
 * page of it, a streaming flush, building a request, a summary), kept in memory only. Nothing is written to disk or
 * sent anywhere; the user can copy or share the list.
 *
 * This is separate from the perf build's spans (src/perf), which normal builds leave out. Measuring costs two
 * `performance.now()` calls and a comparison; only slow work allocates an entry, and details are worked out only
 * then.
 */

export type SlowOperation = { name: string; ms: number; at: number; detail?: string };

export const SLOW_MS = 50;
export const SLOW_LOG_SIZE = 100;

/** A fixed-size ring: the newest `capacity` slow operations, oldest overwritten first. */
export function createSlowLog(capacity = SLOW_LOG_SIZE, threshold = SLOW_MS) {
  const items = new Array<SlowOperation | undefined>(capacity);
  let next = 0;
  let size = 0;
  let total = 0;
  const listeners = new Set<() => void>();
  return {
    threshold,
    capacity,
    /** Keeps the operation when it took at least the threshold; `detail` is only called then. */
    record(name: string, ms: number, detail?: string | (() => string | undefined), at = Date.now()): boolean {
      if (!(ms >= threshold)) return false;
      items[next] = { name, ms: Math.round(ms * 10) / 10, at, detail: typeof detail === "function" ? detail() : detail };
      next = (next + 1) % capacity;
      size = Math.min(size + 1, capacity);
      total += 1;
      for (const listener of listeners) listener();
      return true;
    },
    /** Newest first. */
    list(): SlowOperation[] {
      const out: SlowOperation[] = [];
      for (let index = 1; index <= size; index += 1) out.push(items[(next - index + capacity) % capacity]!);
      return out;
    },
    /** Slow operations seen since the app started (or since the list was cleared), including ones the ring dropped. */
    get total() { return total; },
    clear() {
      items.fill(undefined);
      next = 0;
      size = 0;
      total = 0;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const slowLog = createSlowLog();

const clock = () => performance.now();

/** Times synchronous work. */
export function measure<T>(name: string, run: () => T, detail?: (result: T) => string | undefined): T {
  const started = clock();
  const result = run();
  slowLog.record(name, clock() - started, detail ? () => detail(result) : undefined);
  return result;
}

/** Times asynchronous work, including time spent waiting (a page read off the JS thread, a summary request). */
export async function measureAsync<T>(name: string, run: () => Promise<T>, detail?: (result: T) => string | undefined): Promise<T> {
  const started = clock();
  const result = await run();
  slowLog.record(name, clock() - started, detail ? () => detail(result) : undefined);
  return result;
}

/** For work that starts and ends in different places: `const started = startTimer()` … `endTimer(name, started)`. */
export const startTimer = clock;
export function endTimer(name: string, started: number, detail?: string | (() => string | undefined)) {
  slowLog.record(name, clock() - started, detail);
}
