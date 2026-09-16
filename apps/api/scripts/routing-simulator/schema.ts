import { z } from "zod";

const ms = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const distribution = z.union([
  ms,
  z.object({ kind: z.literal("uniform"), min: ms, max: ms }).strict()
    .refine(v => v.max >= v.min, "max must be >= min"),
  z.object({ kind: z.literal("lognormal"), median: positive, sigma: ms, max: positive }).strict(),
]);
const behavior = z.object({
  latencyMs: distribution.default(300),
  generationMs: distribution.default(700),
  failureRate: z.number().min(0).max(1).default(0),
  failureStatus: z.number().int().min(400).max(599).default(503),
  failureDurationMs: distribution.default(100),
  midStreamError: z.boolean().default(false),
  aborted: z.boolean().default(false),
  capacity: z.number().int().positive().optional(),
  overloadStatus: z.number().int().min(400).max(599).default(429),
  inputTokens: ms.default(100),
  outputTokens: ms.default(100),
  cachedReadTokens: ms.default(0),
  errorCode: z.string().optional(),
}).strict();
const candidate = z.object({
  baseWeight: positive.optional(),
  providerStatus: z.enum(["active", "beta", "alpha", "not_ready"]).optional(),
  providerRoutingStatus: z.enum(["active", "disabled", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3"]).optional(),
  modelRoutingStatus: z.enum(["active", "disabled", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3"]).optional(),
  capabilityStatus: z.enum(["active", "disabled", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3", "internal_testing", "coming_soon"]).optional(),
  offerScope: z.enum(["global", "regional", "specialized"]).optional(),
  residencyMode: z.enum(["unknown", "provider_managed", "customer_selectable", "account_selected"]).optional(),
  executionRegions: z.array(z.string()).optional(),
  dataRegions: z.array(z.string()).optional(),
  zeroDataRetention: z.boolean().optional(),
  maxOutputTokens: positive.optional(),
  quantizationScheme: z.string().optional(),
}).strict();
const context = z.object({
  model: z.string().min(1).default("simulation/model"),
  workspaceId: z.string().default("simulation"),
  endpoint: z.enum(["responses", "chat.completions", "messages"]).default("responses"),
  body: z.record(z.string(), z.unknown()).default({}),
  routingMode: z.enum(["balanced", "price", "latency", "throughput"]).default("balanced"),
  cacheAwareRouting: z.boolean().default(true),
  betaChannelEnabled: z.boolean().default(false),
  alphaChannelEnabled: z.boolean().default(false),
  requestCountry: z.string().optional(),
  requestRegionCode: z.string().optional(),
}).strict();
export const scenarioSchema = z.object({
  name: z.string().min(1),
  seed: z.number().int().min(0).max(0xffffffff).default(1),
  durationMs: positive.max(86_400_000),
  sampleMs: positive.default(1000),
  traceEvery: z.number().int().positive().default(100),
  retainRequests: z.boolean().default(true),
  maxRequests: z.number().int().positive().max(10_000_000).default(200_000),
  healthFeedbackDelayMs: ms.default(0),
  healthBackend: z.enum(["legacy-kv", "coordinated"]).default("legacy-kv"),
  cacheOutages: z.array(z.object({ fromMs: ms, untilMs: positive, reads: z.boolean().default(true), writes: z.boolean().default(true) }).strict()).default([]),
  localCacheResetMs: z.array(ms).default([]),
  emulateKvLimits: z.boolean().default(false),
  strategy: z.enum(["router", "round_robin"]).default("router"),
  context: context.default(() => context.parse({})),
  providers: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    inputUsdPerMillion: ms.default(1),
    outputUsdPerMillion: ms.default(1),
    candidate: candidate.default({}),
    initialHealth: z.object({
      breaker: z.enum(["closed", "open", "half_open"]).optional(),
      breaker_until_ms: ms.optional(),
      breaker_attempts: ms.optional(),
      lat_ewma_60s: ms.optional(),
      lat_ewma_300s: ms.optional(),
      err_ewma_60s: z.number().min(0).max(1).optional(),
      tp_ewma_60s: ms.optional(),
      rate_60s: ms.optional(),
      rec_tot_ew_60s: ms.optional(),
      rec_ok_ew_60s: ms.optional(),
    }).strict().optional(),
    phases: z.array(z.object({ atMs: ms, behavior,
      inputUsdPerMillion: ms.optional(), outputUsdPerMillion: ms.optional(),
    }).strict()).min(1),
  }).strict()).min(1),
  traffic: z.array(z.object({
    fromMs: ms.default(0), untilMs: positive, rps: positive.max(100_000),
    arrival: z.enum(["fixed", "poisson"]).default("fixed"),
  }).strict()).min(1),
  checks: z.array(z.object({
    name: z.string(), fromMs: ms.default(0), untilMs: positive,
    metric: z.enum(["successRate", "p95LatencyMs", "p99LatencyMs", "meanAttempts", "firstAttemptShare", "failureRate", "probeCount", "breakerOpenCount"]),
    provider: z.string().optional(),
    op: z.enum([">=", "<="]), value: z.number().finite(),
  }).strict()).default([]),
}).strict().superRefine((s, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const ids = new Set(s.providers.map(p => p.id));
  if (ids.size !== s.providers.length) issue("provider ids must be unique");
  for (const p of s.providers) {
    if (p.phases[0].atMs !== 0) issue(`${p.id}: first phase must start at 0`);
    p.phases.forEach((phase, i) => {
      if (phase.atMs >= s.durationMs || (i > 0 && phase.atMs <= p.phases[i - 1].atMs)) issue(`${p.id}: phases must increase within durationMs`);
    });
  }
  for (const window of [...s.traffic, ...s.checks, ...s.cacheOutages]) {
    if (window.fromMs >= window.untilMs || window.untilMs > s.durationMs) issue("windows must satisfy 0 <= fromMs < untilMs <= durationMs");
  }
  if (s.localCacheResetMs.some(at => at >= s.durationMs)) issue("local cache resets must occur within durationMs");
  for (const check of s.checks) {
    if (check.provider && !ids.has(check.provider)) issue(`unknown check provider: ${check.provider}`);
    if (check.metric === "firstAttemptShare" && !check.provider) issue("firstAttemptShare requires provider");
  }
  if (s.durationMs / s.sampleMs > 100_000) issue("at most 100,000 health samples per run");
});
export type Scenario = z.infer<typeof scenarioSchema>;
export type Behavior = z.infer<typeof behavior>;
export type Distribution = z.infer<typeof distribution>;
