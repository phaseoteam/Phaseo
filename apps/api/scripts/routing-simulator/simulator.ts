import { installClock } from "./clock";
import { routeProviders, type RoutedCandidate } from "../../src/pipeline/execute/routing";
import * as health from "../../src/pipeline/execute/health";
import { HEALTH_KEYS } from "../../src/pipeline/execute/health.config";
import { calculateMaxTries, stripPrioritySuffix } from "../../src/pipeline/execute/utils";
import { getEffectiveRoutingHints } from "../../src/pipeline/requestRouting";
import { maybeWriteStickyRoutingFromUsage, resetStickyRoutingStateForTests } from "../../src/pipeline/execute/sticky-routing";
import type { ProviderCandidate } from "../../src/pipeline/before/types";
import { Events, keyedSeed, random } from "./events";
import { flushBackground, resetRuntime, transitions, inspectStoredHealth, configureCacheFaults, cacheOperations, getCache } from "./runtime";
import { networkAttempts } from "./network-guard";
import { scenarioSchema, type Scenario, type Distribution } from "./schema";
import { Aggregate } from "./aggregate";
import { setHealthCoordinator, setHealthSnapshot } from "./runtime";
import { emptyHealth, reduceHealth, type HealthEvidence } from "../../src/pipeline/execute/health-evidence";

export const EPOCH = Date.UTC(2026, 8, 15);
export type Attempt = { provider: string; atMs: number; endMs?: number; status?: number; admission: string; healthImpact?: string };
export type RequestRecord = { id: string; atMs: number; endMs: number; success: boolean; attempts: Attempt[] };
export type Sample = { atMs: number; health: Record<string, string>; inflight: Record<string, number> };
function draw(value: Distribution, rng: () => number): number {
  if (typeof value === "number") return value;
  if (value.kind === "uniform") return value.min + rng() * (value.max - value.min);
  const normal = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, rng()))) * Math.cos(2 * Math.PI * rng());
  return Math.min(value.max, value.median * Math.exp(value.sigma * normal));
}
export function candidatesFor(s: Scenario): ProviderCandidate[] {
  return s.providers.map(p => ({
    providerId: p.id, providerStatus: "active", providerRoutingStatus: "active",
    modelRoutingStatus: "active", capabilityStatus: "active", baseWeight: 1,
    ...p.candidate,
    adapter: { name: p.id } as ProviderCandidate["adapter"],
    byokMeta: [], providerModelSlug: s.context.model,
    pricingCard: {
      provider: p.id, model: s.context.model, endpoint: s.context.endpoint,
      effective_from: null, effective_to: null, currency: "USD", version: "simulation",
      rules: [["input_text_tokens", p.inputUsdPerMillion], ["output_text_tokens", p.outputUsdPerMillion]].map(([meter, price]) => ({
        meter, unit: "token", unit_size: 1_000_000, price_per_unit: String(price),
        currency: "USD", pricing_plan: "standard", match: [], priority: 1,
      })),
    } as ProviderCandidate["pricingCard"],
  }));
}
export async function simulate(input: unknown) {
  const scenario = scenarioSchema.parse(input);
  const networkStart = networkAttempts.length;
  await flushBackground(); resetRuntime(); health.resetHealthStateForTests(); resetStickyRoutingStateForTests();
  const clock = installClock(EPOCH);
  try {
    const events = new Events();
    const candidates = candidatesFor(scenario);
    const baseModel = stripPrioritySuffix(scenario.context.model);
    const { endpoint, workspaceId } = scenario.context;
    const healthKey = HEALTH_KEYS.health(endpoint, baseModel);
    const initialMap: Record<string, string> = {};
    for (const provider of scenario.providers) if (provider.initialHealth) {
      for (const [key, value] of Object.entries(provider.initialHealth)) {
        initialMap[`${provider.id}::${key}`] = String(key === "breaker_until_ms" ? EPOCH + Number(value) : value);
      }
      for (const key of ["last_updated", "last_ts_10s", "last_ts_60s", "last_ts_300s"]) initialMap[`${provider.id}::${key}`] = String(EPOCH);
    }
    if (Object.keys(initialMap).length) {
      await getCache().put(healthKey, JSON.stringify(initialMap), { expirationTtl: 86400 });
      await health.readHealthMany(endpoint, baseModel, scenario.providers.map(p => p.id));
    }
    configureCacheFaults(EPOCH, scenario.cacheOutages, scenario.emulateKvLimits);
    let coordinatedStates: Record<string, HealthEvidence> | undefined;
    if (scenario.healthBackend === "coordinated") {
      const states: Record<string, HealthEvidence> = Object.fromEntries(scenario.providers.map(p => [p.id, {
        ...emptyHealth(endpoint, baseModel, p.id), ...p.initialHealth,
        breaker_until_ms: p.initialHealth?.breaker_until_ms ? EPOCH + p.initialHealth.breaker_until_ms : 0,
        last_ts_10s: EPOCH, last_ts_60s: EPOCH, last_ts_300s: EPOCH,
        last_success_ms: p.initialHealth ? EPOCH : 0, last_updated: EPOCH,
      }]));
      coordinatedStates = states;
        let version = 0;
      const ids = new Set<string>();
        setHealthSnapshot(() => ({ version, publishedAt: Math.max(...Object.values(states).map(state => state.last_updated)), providers: states }));
      setHealthCoordinator(async observation => {
        if (ids.has(observation.id)) return { health: states[observation.provider], version };
        ids.add(observation.id);
        const previous = states[observation.provider];
        const next = reduceHealth(previous, observation);
        states[observation.provider] = next;
        if (previous.breaker !== next.breaker) transitions.push({ provider_id: next.provider, breaker_state: next.breaker,
          open_until_ms: next.breaker_until_ms, last_transition_at: new Date(Date.now()).toISOString(), updated_at: new Date(Date.now()).toISOString() });
        version++;
        return { health: structuredClone(next), version };
      });
    }
    for (const at of scenario.localCacheResetMs) events.add(at, -1, async () => {
      health.resetHealthStateForTests(); resetStickyRoutingStateForTests();
    });
    const requests: RequestRecord[] = [];
    const total = new Aggregate();
    const windows = Array.from({length: Math.ceil(scenario.durationMs/scenario.sampleMs)}, () => new Aggregate());
    const checkAggregates = scenario.checks.map(() => new Aggregate());
    const probeChecks = scenario.checks.map(() => 0);
    const samples: Sample[] = [];
    const traces: Array<{ atMs: number; requestId: string; diagnostics: Awaited<ReturnType<typeof routeProviders>>["diagnostics"]; scores: unknown[] }> = [];
    const inflight: Record<string, number> = Object.fromEntries(scenario.providers.map(p => [p.id, 0]));
    let now = 0;
    let sequence = 0;
    let baselineCursor = 0;
    const complete = (record: RequestRecord) => {
      record.endMs = now; total.add(record);
      windows[Math.floor(record.atMs/scenario.sampleMs)].add(record);
      scenario.checks.forEach((c,i) => { if(record.atMs >= c.fromMs && record.atMs < c.untilMs) checkAggregates[i].add(record); });
    };
    for (const [i, provider] of scenario.providers.entries()) for (const phase of provider.phases) {
      if (phase.inputUsdPerMillion !== undefined || phase.outputUsdPerMillion !== undefined) events.add(phase.atMs, -1, async () => {
        candidates[i].pricingCard = { ...candidates[i].pricingCard!, rules: candidates[i].pricingCard!.rules.map(rule => ({...rule,
          price_per_unit: String((rule.meter === "input_text_tokens" ? phase.inputUsdPerMillion : phase.outputUsdPerMillion) ?? rule.price_per_unit),
        })) };
      });
    }
    const attempt = async (record: RequestRecord, ranked: Array<Pick<RoutedCandidate,"candidate"|"health">>, index: number): Promise<void> => {
      const entry = ranked[index];
      if (!entry) { complete(record); return; }
      const provider = scenario.providers.find(p => p.id === entry.candidate.providerId)!;
      const admission = await health.admitThroughBreaker(endpoint, provider.id, baseModel, workspaceId, record.id, entry.health);
      const log: Attempt = { provider: provider.id, atMs: now, admission };
      record.attempts.push(log);
      if (admission === "probe") scenario.checks.forEach((c,i) => { if (now >= c.fromMs && now < c.untilMs && (!c.provider || c.provider === provider.id)) probeChecks[i]++; });
      if (admission === "blocked") { await attempt(record, ranked, index + 1); return; }
      // Environment randomness is keyed by request and provider. Changing routing
      // policy does not shift every subsequent provider's random outcome.
      const rng = random(keyedSeed(`${scenario.seed}:${record.id}:${provider.id}`));
      const behavior = provider.phases.findLast(p => p.atMs <= now)!.behavior;
      const overloaded = behavior.capacity !== undefined && inflight[provider.id] >= behavior.capacity;
      const failed = rng() < behavior.failureRate;
      const status = overloaded ? behavior.overloadStatus : failed ? behavior.failureStatus : 200;
      const latency = draw(behavior.latencyMs, rng);
      const generation = draw(behavior.generationMs, rng);
      const duration = status >= 400 ? draw(behavior.failureDurationMs, rng) : latency + generation;
      // Outcomes are fixed at admission. Only a pre-stream HTTP failure can
      // retry, so successful/in-stream calls need not retain twenty snapshots.
      const remaining = status >= 400 && !behavior.midStreamError && !behavior.aborted ? ranked.slice(index + 1) : [];
      // An overflow rejection does not reserve an execution slot. Counting it
      // here would let rejected retries artificially keep the provider full.
      if (!overloaded) inflight[provider.id]++;
      events.add(now + duration, 0, async () => {
        if (!overloaded) inflight[provider.id]--;
        const impact = health.classifyProviderHealthImpact({ upstreamStatus: status, midStreamError: behavior.midStreamError, aborted: behavior.aborted, errorCode: behavior.errorCode });
        log.endMs = now; log.status = status; log.healthImpact = impact;
        events.add(now + scenario.healthFeedbackDelayMs, 0, async () => {
          const healthUpdate = await health.onCallEnd(endpoint, {
            observationId: `${record.id}:${log.atMs}:${provider.id}`, startedAt: EPOCH + log.atMs, probe: admission === "probe",
            provider: provider.id, model: baseModel, ok: status < 400, healthImpact: impact,
            upstreamStatus: status, errorCode: behavior.errorCode,
            latency_ms: status >= 400 || behavior.midStreamError || behavior.aborted ? duration : latency,
            generation_ms: status < 400 ? generation : 0,
            tokens_in: status < 400 ? behavior.inputTokens : 0,
            tokens_out: status < 400 ? behavior.outputTokens : 0,
          });
          if (admission === "probe" && impact !== "neutral" && !healthUpdate.rateLimited) await health.reportProbeResult(endpoint, provider.id, baseModel, impact === "success");
          else if (impact === "failure" && !healthUpdate.rateLimited) await health.maybeOpenOnRecentErrors(endpoint, provider.id, baseModel);
          if (impact === "success") await maybeWriteStickyRoutingFromUsage({
            workspaceId, endpoint, model: baseModel, body: scenario.context.body,
            providerId: provider.id, enabled: scenario.context.cacheAwareRouting,
            usage: { input_tokens_details: { cached_tokens: behavior.cachedReadTokens } },
          });
        });
        if (status < 400 && !behavior.midStreamError && !behavior.aborted) { record.success = true; complete(record); }
        // Once a stream has been delivered, a failure cannot be retried as a new response.
        else if (behavior.midStreamError || behavior.aborted) complete(record);
        else await attempt(record, remaining, 0);
      });
    };
    for (const [segmentIndex, traffic] of scenario.traffic.entries()) {
      const rng = random(keyedSeed(`arrivals:${scenario.seed}:${segmentIndex}`));
      let at = traffic.fromMs;
      let arrivalIndex = 0;
      if (traffic.arrival === "poisson") at += -Math.log(Math.max(Number.EPSILON, 1 - rng())) * 1000 / traffic.rps;
      const enqueue = () => {
        if (at >= traffic.untilMs || (traffic.arrival === "fixed" && arrivalIndex >= Math.ceil((traffic.untilMs-traffic.fromMs)*traffic.rps/1000-1e-9))) return;
        if (++sequence > scenario.maxRequests) throw new Error(`Scenario exceeds maxRequests (${scenario.maxRequests}); no partial report produced`);
        const id = `sim-${scenario.seed}-${sequence}`;
        const requestSequence = sequence;
        events.add(at, 1, async () => {
          const record: RequestRecord = { id, atMs: now, endMs: now, success: false, attempts: [] };
          if (scenario.retainRequests || (requestSequence - 1) % scenario.traceEvery === 0) requests.push(record);
          const routed = await routeProviders(candidates, { ...scenario.context, requestId: id, collectDetailedDiagnostics: (requestSequence-1)%scenario.traceEvery === 0 });
          if ((requestSequence - 1) % scenario.traceEvery === 0) traces.push({
            atMs: now, requestId: id, diagnostics: routed.diagnostics,
            scores: routed.ranked.map(r => ({ provider: r.candidate.providerId, score: r.score, trace: r.scoreTrace })),
          });
          let ranked = routed.ranked;
          if (scenario.strategy === "round_robin" && ranked.length) {
            ranked = [...ranked].sort((a, b) => scenario.providers.findIndex(p => p.id === a.candidate.providerId) - scenario.providers.findIndex(p => p.id === b.candidate.providerId));
            const offset = baselineCursor++ % ranked.length;
            ranked = [...ranked.slice(offset), ...ranked.slice(0, offset)];
          }
          const maxTries = calculateMaxTries(ranked.length, getEffectiveRoutingHints(scenario.context.body).allowFallbacks);
          // Keep the real admission snapshot/order for retries, but release score
          // diagnostic closures while synthetic upstream calls are in flight.
          await attempt(record, ranked.slice(0, maxTries).map(({candidate,health})=>({candidate,health})), 0);
          at = traffic.arrival === "fixed" ? traffic.fromMs + (++arrivalIndex)*1000/traffic.rps : at - Math.log(Math.max(Number.EPSILON, 1-rng()))*1000/traffic.rps;
          enqueue();
        });
      };
      enqueue();
    }
    for (let at = 0; at <= scenario.durationMs; at += scenario.sampleMs) events.add(at, 2, async () => {
      const sampledHealth = coordinatedStates ? Object.fromEntries(Object.entries(coordinatedStates)
        .flatMap(([provider, h]) => Object.entries(h).map(([key, value]) => [`${provider}::${key}`, String(value)]))) : inspectStoredHealth(healthKey);
      samples.push({ atMs: now, health: sampledHealth, inflight: { ...inflight } });
      if (process.env.ROUTING_SIM_PROGRESS === "1" && at % 10_000 === 0) console.log(`${scenario.name}: ${at}ms simulated, ${sequence} arrivals scheduled`);
    });
    for (let event = events.pop(); event; event = events.pop()) {
      now = event.at; clock.set(EPOCH + now);
      await event.run(); await flushBackground();
    }
    const finalHealth = await health.readHealthMany(endpoint, baseModel, scenario.providers.map(p => p.id));
    await flushBackground();
    if (total.count !== sequence) throw new Error(`Incomplete run: ${total.count} completed of ${sequence} arrivals`);
    const blockedNetworkAttempts = networkAttempts.length - networkStart;
    if (blockedNetworkAttempts) throw new Error(`${blockedNetworkAttempts} unexpected network attempts were blocked`);
    return {
      scenario, metadata: { epoch: EPOCH, algorithm: traces[0]?.diagnostics.algorithm.version ?? null,
        fidelity: scenario.healthBackend === "coordinated"
          ? "real routing/coordinator-client/reducer; simulated RPC and 60s publication; one isolate; in-memory KV; not WAN propagation or DO throughput"
          : "real routing/health/sticky code; synthetic managed-credential attempt lifecycle; one isolate; immediate in-memory KV",
        blockedNetworkAttempts, simulatedEndMs: now, cacheOperations: { ...cacheOperations } },
      requests, samples, traces, finalHealth,
      aggregates: { summary: total.result(), windows: windows.map(w => w.result()), checks: checkAggregates.map(c => c.result()), probeChecks },
      transitions: structuredClone(transitions),
    };
  } finally { try { await flushBackground(); } finally { clock.restore(); } }
}
export type Simulation = Awaited<ReturnType<typeof simulate>>;
