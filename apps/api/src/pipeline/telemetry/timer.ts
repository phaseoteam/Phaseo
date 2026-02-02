// src/lib/telemetry/timer.ts
// Purpose: Timing utilities for measuring request stages.
// Why: Consistent latency metrics across the pipeline.
// How: Records timestamps and computes durations.

export type TimingSnapshot = Record<string, number>; // ms (1 decimal)

export class Timer {
    private marks = new Map<string, number>();
    private spans = new Map<string, number>();
    private prefix = "";

    constructor(prefix?: string) {
        if (prefix) this.prefix = sanitize(prefix) + ".";
        // Always set a request_start mark for convenience
        this.marks.set(this.k("request_start"), performance.now());
    }

    /** Namespacing helper */
    withPrefix(prefix: string) {
        const t = new Timer(this.prefix + sanitize(prefix));
        // carry over marks so you can do cross-cut spans
        for (const [k, v] of this.marks) t.marks.set(k, v);
        return t;
    }

    /** Mark a point in time */
    mark(name: string) {
        this.marks.set(this.k(name), performance.now());
    }

    /** End a previously marked start -> span(name) */
    end(name: string, startMark = name) {
        const start = this.marks.get(this.k(startMark));
        if (start === undefined) return;
        const dur = performance.now() - start;
        this.spans.set(this.k(name), dur);
        return dur;
    }

    /**
     * Measure between two named marks (useful for cross-phase spans).
     * If endMark is omitted, uses "now".
     */
    between(name: string, startMark: string, endMark?: string) {
        const s = this.marks.get(this.k(startMark));
        const e =
            endMark !== undefined ? this.marks.get(this.k(endMark)) : performance.now();
        if (s === undefined || e === undefined) return;
        const dur = Math.max(0, e - s);
        this.spans.set(this.k(name), dur);
        return dur;
    }

    /**
     * Time a function (sync or async). Stores span under `name`.
     * Returns the function result.
     */
    async span<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
        const start = performance.now();
        try {
            const out = await fn();
            this.spans.set(this.k(name), performance.now() - start);
            return out;
        } catch (e) {
            this.spans.set(this.k(name), performance.now() - start);
            throw e;
        }
    }

    /** Server-Timing header value (e.g., "total;dur=12.3, parse_json;dur=0.8") */
    serverTiming(): string {
        return [...this.spans.entries()]
            .map(([key, dur]) => `${toToken(key)};dur=${dur.toFixed(1)}`)
            .join(", ");
    }

    /** Alias for serverTiming() */
    header(): string {
        return this.serverTiming();
    }

    /** JSON snapshot of spans (ms, 1 decimal). Keys are as-recorded. */
    snapshot(): TimingSnapshot {
        const out: TimingSnapshot = {};
        for (const [k, v] of this.spans) out[k] = round1(v);
        return out;
    }

    /** Mark total if you’ve set a "response_start" (or pass a custom end mark) */
    finalizeTotal(totalName = "total_ms", endMark = "response_start") {
        this.between(this.k(totalName), this.k("request_start"), this.k(endMark));
    }

    /** Attach Server-Timing (+ optional JSON) to a response */
    attachTo(res: Response, { exposeJsonHeader = false } = {}) {
        const h = new Headers(res.headers);
        const st = this.serverTiming();
        if (st) h.set("Server-Timing", st);
        if (exposeJsonHeader) h.set("X-Timing", JSON.stringify(this.snapshot()));
        return new Response(res.body, { status: res.status, headers: h });
    }

    /** Get elapsed time from a mark to now (ms) */
    elapsed(fromMark: string): number {
        const start = this.marks.get(this.k(fromMark));
        if (start === undefined) return 0;
        return performance.now() - start;
    }

    private k(name: string) {
        return this.prefix ? `${this.prefix}${name}` : name;
    }
}

function round1(n: number) {
    return Math.round(n * 10) / 10;
}
function sanitize(s: string) {
    return s.replace(/[^A-Za-z0-9._-]/g, "_");
}
function toToken(s: string) {
    // Server-Timing token charset (token)
    return s.replace(/[^A-Za-z0-9._-]/g, "_");
}










