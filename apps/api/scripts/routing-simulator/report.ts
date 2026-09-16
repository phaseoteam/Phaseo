import type { Simulation, RequestRecord } from "./simulator";
const quantile = (values: number[], q: number) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(q * values.length) - 1)] : null;
export function summarize(requests: RequestRecord[]) {
  const latencies = requests.map(r => r.endMs - r.atMs);
  const attempts = requests.flatMap(r => r.attempts.filter(a => a.admission !== "blocked"));
  return {
    requests: requests.length,
    successRate: requests.length ? requests.filter(r => r.success).length / requests.length : null,
    failureRate: requests.length ? requests.filter(r => !r.success).length / requests.length : null,
    p50LatencyMs: quantile(latencies, 0.5), p95LatencyMs: quantile(latencies, 0.95), p99LatencyMs: quantile(latencies, 0.99),
    successfulP95LatencyMs: quantile(requests.filter(r => r.success).map(r => r.endMs - r.atMs), 0.95),
    meanAttempts: requests.length ? attempts.length / requests.length : null,
    attempts: attempts.length,
    retries: requests.reduce((n, r) => n + Math.max(0, r.attempts.filter(a => a.admission !== "blocked").length - 1), 0),
    providerFirstAttempts: Object.fromEntries([...new Set(attempts.map(a => a.provider))].map(provider => [provider, requests.filter(r => r.attempts.find(a => a.admission !== "blocked")?.provider === provider).length])),
  };
}
export function report(result: Simulation) {
  const { scenario } = result;
  const summary = result.aggregates.summary;
  const checks = scenario.checks.map((check, index) => {
    const metrics = result.aggregates.checks[index];
    let actual: number | null;
    if (check.metric === "firstAttemptShare") actual = metrics.requests ? (metrics.providerFirstAttempts[check.provider!] ?? 0) / metrics.requests : null;
    else if (check.metric === "probeCount") actual = result.aggregates.probeChecks[index];
    else if (check.metric === "breakerOpenCount") actual = result.transitions.filter(t => {
      const at = Date.parse(String(t.last_transition_at)) - result.metadata.epoch;
      return at >= check.fromMs && at < check.untilMs && t.breaker_state === "open" && (!check.provider || t.provider_id === check.provider);
    }).length;
    else actual = metrics[check.metric];
    return { ...check, actual, passed: actual !== null && (check.op === ">=" ? actual >= check.value : actual <= check.value) };
  });
  const windows = [];
  for (let at = 0; at < scenario.durationMs; at += scenario.sampleMs) windows.push({
    fromMs: at, untilMs: Math.min(scenario.durationMs, at + scenario.sampleMs),
    ...result.aggregates.windows[Math.round(at / scenario.sampleMs)],
  });
  return { summary, checks, passed: checks.every(c => c.passed), windows };
}
export function markdown(result: Simulation, metrics: ReturnType<typeof report>) {
  const { summary } = metrics;
  return `# ${result.scenario.name}\n\n` +
    `Seed: ${result.scenario.seed}. Strategy: ${result.scenario.strategy}. Algorithm: ${result.metadata.algorithm}.\n\n` +
    `${summary.requests} requests; ${summary.attempts} attempts; ${summary.retries} retries.\n\n` +
    `Success: ${summary.successRate === null ? "n/a" : (100 * summary.successRate).toFixed(2) + "%"}. p95: ${summary.p95LatencyMs?.toFixed(1) ?? "n/a"} ms. p99: ${summary.p99LatencyMs?.toFixed(1) ?? "n/a"} ms.\n\n` +
    `## Target checks\n\n| Check | Actual | Target | Result |\n|---|---:|---:|---|\n` +
    metrics.checks.map(c => `| ${c.name.replaceAll("|", "\\|").replaceAll("\n", " ")} | ${c.actual ?? "no observations"} | ${c.op} ${c.value} | ${c.passed ? "PASS" : "FAIL"} |`).join("\n") +
    `\n\n## Fidelity\n\n${result.metadata.fidelity}. Health feedback delay: ${result.scenario.healthFeedbackDelayMs} ms.\n\n` +
    `Requests are assigned to windows by arrival time, including retries and completions after the window. Probe and breaker counts use event time. Health samples observe persisted local state without refreshing router caches. Zero-observation rate/latency checks fail.\n\n` +
    `Provider behavior is chosen at attempt start. Existing calls keep their original outcome when a phase changes. Latency and generation are separate; learning occurs after completion plus the configured feedback delay. Phase durations are simulated time, not wall-clock performance measurements.\n\n` +
    `Cache outages fail reads/writes during configured windows; local cache resets discard health and sticky L1 state. Initial health, when supplied, is a synthetic starting snapshot, not learned evidence.\n\n` +
    `Excludes distributed KV consistency, multiple Worker isolates, HTTP protocol/executor behavior, authentication, billing, model selection, pre-routing capability discovery, gateway rate limiting, and BYOK credentials. Synthetic failures retry remaining ranked candidates; executor-specific stop-fallback decisions are outside this model. Round-robin retains eligibility gates and circuit breakers but replaces the ranked order.\n`;
}
