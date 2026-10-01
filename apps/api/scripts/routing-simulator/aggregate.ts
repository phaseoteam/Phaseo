import type { RequestRecord } from "./simulator";

/** Fixed 1 ms histogram; quantiles are upper bounds with at most 1 ms rounding. */
export class Aggregate {
  count = 0; successes = 0; attempts = 0; retries = 0;
  first: Record<string, number> = {}; failures: Record<string, number> = {};
  outcomes: Record<string, number> = {};
  private latency = new Map<number, number>();
  private successfulLatency = new Map<number, number>();
  add(r: RequestRecord) {
    if (!Number.isFinite(r.endMs) || r.endMs < r.atMs) throw new Error("Invalid request completion time");
    this.count++; this.successes += Number(r.success);
    const attempts = r.attempts.filter(a => a.admission !== "blocked");
    this.attempts += attempts.length; this.retries += Math.max(0, attempts.length - 1);
    if (attempts[0]) this.first[attempts[0].provider] = (this.first[attempts[0].provider] ?? 0) + 1;
    for (const a of attempts) {
      const key = `${a.status}:${a.healthImpact}`;
      this.outcomes[key] = (this.outcomes[key] ?? 0) + 1;
      if (a.healthImpact === "failure") this.failures[a.provider] = (this.failures[a.provider] ?? 0) + 1;
    }
    const ms = Math.ceil(r.endMs - r.atMs);
    this.latency.set(ms, (this.latency.get(ms) ?? 0) + 1);
    if (r.success) this.successfulLatency.set(ms, (this.successfulLatency.get(ms) ?? 0) + 1);
  }
  private quantile(map: Map<number, number>, count: number, q: number) {
    if (!count) return null;
    let seen = 0;
    for (const [ms, n] of [...map].sort((a,b) => a[0]-b[0])) { seen += n; if (seen >= Math.ceil(count*q)) return ms; }
    return null;
  }
  result() {
    return { requests: this.count, successRate: this.count ? this.successes / this.count : null,
      failureRate: this.count ? 1-this.successes/this.count : null,
      p50LatencyMs: this.quantile(this.latency, this.count, .5), p95LatencyMs: this.quantile(this.latency, this.count, .95), p99LatencyMs: this.quantile(this.latency, this.count, .99),
      successfulP95LatencyMs: this.quantile(this.successfulLatency, this.successes, .95),
      meanAttempts: this.count ? this.attempts/this.count : null, attempts: this.attempts, retries: this.retries,
      providerFirstAttempts: this.first, providerFailures: this.failures, outcomes: this.outcomes };
  }
}
