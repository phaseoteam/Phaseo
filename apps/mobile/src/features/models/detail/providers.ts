import type { ProviderHealthRow, ProviderModel, ProviderPricing } from "@/lib/api/models";
// Pure web modules, shared so statuses and names match phaseo.app exactly.
import { chooseGatewayStatus, getGatewayStatusSortRank, normalizeGatewayStatusValue, resolveGatewayStatus, type CanonicalGatewayStatus } from "../../../../../web/src/components/(data)/model/pricing/providerGatewayStatus";
import { formatProviderOfferDisplayName, resolveProviderDisplayName, resolveProviderLogoId } from "../../../../../web/src/lib/providers/providerOffers";
import { serviceTierLabel } from "./tiers";

export type { CanonicalGatewayStatus };

export const PLAN_ORDER = ["free", "standard", "priority", "ultrafast", "flex", "batch"] as const;

export function normalizePlan(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase() || "standard";
}

const planRank = (plan: string) => {
  const index = (PLAN_ORDER as readonly string[]).indexOf(plan);
  return index < 0 ? PLAN_ORDER.length : index;
};

/** Service tiers a provider prices for this model, in the website's order (free, standard, fast, …). */
export function providerPlans(provider: ProviderPricing): string[] {
  const plans = [...new Set(provider.pricing_rules.map((rule) => normalizePlan(rule.pricing_plan)))].sort((a, b) => planRank(a) - planRank(b) || a.localeCompare(b));
  return plans.length || !provider.provider_models.length ? plans : ["standard"];
}

/** Standard when priced, else free, else the first tier. */
export function defaultPlan(provider: ProviderPricing) {
  const plans = providerPlans(provider);
  if (plans.includes("standard")) return "standard";
  if (plans.includes("free")) return "free";
  return plans[0] ?? "standard";
}

/** The provider's routes that serve a tier: tier-tagged routes first, else every route. */
export function modelScopeForPlan(provider: ProviderPricing, plan: string): ProviderModel[] {
  const tagged = provider.provider_models.filter((model) => model.service_tier != null && normalizePlan(model.service_tier) === normalizePlan(plan));
  return tagged.length ? tagged : provider.provider_models;
}

/** The provider's routing status for this model (apps/web ModelPricingClient resolveProviderGatewayStatus). */
export function providerStatus(provider: ProviderPricing, plan = defaultPlan(provider)): CanonicalGatewayStatus {
  return chooseGatewayStatus(modelScopeForPlan(provider, plan).map((model) => resolveGatewayStatus({
    isActiveGateway: model.is_active_gateway,
    providerAvailabilityStatus: model.provider_availability_status,
    phaseoStatus: model.phaseo_status,
    accessScope: model.access_scope,
    capabilityStatus: model.capability_status,
    providerStatus: provider.provider.status,
    providerRoutingStatus: provider.provider.routing_status,
    modelRoutingStatus: model.routing_status,
    effectiveFrom: model.effective_from,
    effectiveTo: model.effective_to,
  })));
}

export type ListingCategory = "routable" | "preview" | "inactive" | "external";

export function listingCategory(provider: ProviderPricing, status: CanonicalGatewayStatus): ListingCategory {
  if (normalizeGatewayStatusValue(provider.provider.status) === "external" || status === "external") return "external";
  if (["active", "deranked_lvl1", "deranked_lvl2", "deranked_lvl3"].includes(status)) return "routable";
  if (["coming_soon", "internal_testing"].includes(status)) return "preview";
  return "inactive";
}

export const DEFAULT_STATUS_FILTERS: ListingCategory[] = ["routable", "preview", "inactive"];

/** "Google Vertex (EU)", "Claude Platform for AWS": the website's provider display names. */
export function providerDisplayName(provider: ProviderPricing["provider"]) {
  const providerId = provider.api_provider_id ?? "";
  return resolveProviderDisplayName({
    providerId,
    providerName: provider.api_provider_name || providerId || "Provider",
    offerLabel: provider.offer_label,
    offerScope: (provider.offer_scope as "global" | "regional" | "specialized" | null | undefined) ?? null,
  });
}

/** Name with any offer label ("Anthropic (AWS)" style), as the pricing tables use. */
export function providerOfferName(provider: ProviderPricing["provider"]) {
  const providerId = provider.api_provider_id ?? "";
  return formatProviderOfferDisplayName({
    providerId,
    providerName: provider.api_provider_name || providerId || "Provider",
    offerLabel: provider.offer_label,
    offerScope: (provider.offer_scope as "global" | "regional" | "specialized" | null | undefined) ?? null,
  });
}

export function providerLogoId(provider: ProviderPricing["provider"]) {
  return resolveProviderLogoId({ providerId: provider.api_provider_id ?? "", providerFamilyId: provider.provider_family_id });
}

/** "Fast", "Batch", "Flex": the website's tier names. */
export const tierLabel = serviceTierLabel;

const SELECTABLE_TIERS = ["priority", "ultrafast", "flex", "batch"];

/**
 * Regional, specialised and tier routes go under "Additional routing options". Claude Platform on AWS
 * is Anthropic-operated rather than a regional route, so it stays with the main providers.
 */
export function isRouteVariant(provider: ProviderPricing, plan: string) {
  const id = (provider.provider.api_provider_id ?? "").toLowerCase();
  if (id === "anthropic-aws" && !SELECTABLE_TIERS.includes(plan)) return false;
  return provider.provider.offer_scope === "regional" || provider.provider.offer_scope === "specialized" || id.endsWith("-eu") || id.endsWith("-us") || SELECTABLE_TIERS.includes(plan);
}

/** Live routing numbers per provider and tier, from `/provider-health` (3 days, hourly buckets). */
export type RuntimeStats = {
  latencyMs: number | null;
  throughput: number | null;
  uptimePct: number | null;
  requestSuccessPct: number | null;
  requests3d: number;
  requests30m: number;
  lastRequestAt: string | null;
};

const tierKey = (tier: string | null | undefined) => {
  const value = normalizePlan(tier);
  if (value === "default") return "standard";
  return value === "fast" ? "priority" : value;
};

export const statsKey = (providerId: string, tier = "standard") => `${providerId}\u0000${tierKey(tier)}`;

const firstFinite = (...values: (number | null | undefined)[]) => values.find((value): value is number => value != null && Number.isFinite(value)) ?? null;

export function runtimeStatsFromHealth(rows: ProviderHealthRow[]): Map<string, RuntimeStats> {
  const stats = new Map<string, RuntimeStats>();
  for (const row of rows) {
    stats.set(statsKey(row.provider_id, row.service_tier ?? "standard"), {
      latencyMs: firstFinite(row.percentile_latency_ms_30m, row.p50_latency_ms_30m, row.median_latency_ms_30m, row.avg_latency_ms_30m, row.percentile_latency_ms, row.avg_latency_ms),
      throughput: firstFinite(row.percentile_throughput_30m, row.p50_throughput_30m, row.median_throughput_30m, row.avg_throughput_30m, row.percentile_throughput, row.avg_throughput),
      // Uptime only counts once health requests were observed (the website hides it otherwise).
      uptimePct: row.health_requests > 0 ? row.uptime_pct ?? null : null,
      requestSuccessPct: row.request_success_pct ?? null,
      requests3d: row.requests,
      requests30m: row.requests_30m,
      lastRequestAt: row.last_request_at ?? null,
    });
  }
  return stats;
}

// Estimated routing order, ported from ModelPricingClient's default sort.
const ROUTING_WEIGHTS = { price: 0.32, uptime: 0.28, latency: 0.2, throughput: 0.14, observations: 0.06 } as const;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const positive = (value: number | null | undefined) => (value != null && Number.isFinite(value) && value > 0 ? value : null);

function statusMultiplier(status: CanonicalGatewayStatus) {
  if (status === "active") return 1;
  if (status === "deranked_lvl1") return 1e-3;
  if (status === "deranked_lvl2") return 1e-6;
  if (status === "deranked_lvl3") return 1e-9;
  return 0;
}

function metricScore(value: number | null, min: number | null, max: number | null, lowerIsBetter: boolean) {
  if (value === null) return 0.2;
  if (min === null || max === null) return 0.5;
  if (max <= min) return 1;
  const normalised = clamp01((value - min) / (max - min));
  return lowerIsBetter ? 1 - normalised : normalised;
}

function observationConfidence(stats: RuntimeStats | undefined) {
  if (!stats) return 0;
  const requestConfidence = clamp01(Math.log10(Math.max(0, stats.requests3d) + 1) / 2);
  const recent = stats.requests30m > 0 ? 0.2 : 0;
  const metrics = (positive(stats.latencyMs) ? 0.25 : 0) + (positive(stats.throughput) ? 0.25 : 0) + (stats.uptimePct !== null ? 0.25 : 0) + (stats.lastRequestAt ? 0.25 : 0);
  return clamp01(Math.max(requestConfidence, metrics) + recent);
}

/** Cheaper routes weigh more: 1/price², normalised to the cheapest. Free routes count as a tenth of the cheapest paid price. */
export function inversePriceWeights(entries: { id: string; price: number | null }[]) {
  const prices = entries.map((entry) => entry.price).filter((price): price is number => price != null && Number.isFinite(price));
  if (!prices.length) return new Map(entries.map((entry) => [entry.id, 0.5]));
  const paid = prices.filter((price) => price > 0);
  const freeFloor = paid.length ? Math.min(...paid) / 10 : 1;
  const raw = new Map(entries.map((entry) => [entry.id, entry.price == null ? 0 : 1 / Math.pow(entry.price > 0 ? entry.price : freeFloor, 2)]));
  const max = Math.max(...raw.values(), 0);
  if (max <= 0) return new Map(entries.map((entry) => [entry.id, 0.5]));
  return new Map(entries.map((entry) => [entry.id, (raw.get(entry.id) ?? 0) / max]));
}

/**
 * The website's default provider order: routable providers by an estimated routing score (price,
 * uptime, latency, throughput and how much traffic was observed), then by status, the model's creator
 * first, then name.
 */
export function sortProviders(providers: ProviderPricing[], { stats, creatorId, basePrice }: { stats: Map<string, RuntimeStats>; creatorId?: string | null; basePrice: (provider: ProviderPricing) => number | null }) {
  const statsFor = (provider: ProviderPricing) => stats.get(statsKey(provider.provider.api_provider_id ?? "", defaultPlan(provider)));
  const status = new Map(providers.map((provider) => [provider, providerStatus(provider)]));
  const weights = inversePriceWeights(providers.map((provider) => ({ id: provider.provider.api_provider_id ?? "", price: basePrice(provider) })));
  const latencies = providers.map((provider) => positive(statsFor(provider)?.latencyMs)).filter((value): value is number => value !== null);
  const throughputs = providers.map((provider) => positive(statsFor(provider)?.throughput)).filter((value): value is number => value !== null);
  const [minLatency, maxLatency] = latencies.length ? [Math.min(...latencies), Math.max(...latencies)] : [null, null];
  const [minThroughput, maxThroughput] = throughputs.length ? [Math.min(...throughputs), Math.max(...throughputs)] : [null, null];

  const score = (provider: ProviderPricing) => {
    const multiplier = statusMultiplier(status.get(provider)!);
    if (multiplier <= 0) return 0;
    const runtime = statsFor(provider);
    const confidence = observationConfidence(runtime);
    const errorRate = 1 - (runtime?.requestSuccessPct ?? runtime?.uptimePct ?? 100) / 100;
    const weighted = ROUTING_WEIGHTS.price * (weights.get(provider.provider.api_provider_id ?? "") ?? 0.5)
      + ROUTING_WEIGHTS.uptime * Math.max(0.05, Math.min(1, 1 - clamp01(errorRate)))
      + ROUTING_WEIGHTS.latency * metricScore(positive(runtime?.latencyMs), minLatency, maxLatency, true)
      + ROUTING_WEIGHTS.throughput * metricScore(positive(runtime?.throughput), minThroughput, maxThroughput, false)
      + ROUTING_WEIGHTS.observations * confidence;
    return multiplier * (0.55 + 0.45 * clamp01(confidence)) * weighted;
  };
  const scores = new Map(providers.map((provider) => [provider, score(provider)]));
  const name = (provider: ProviderPricing) => provider.provider.api_provider_name || provider.provider.api_provider_id || "";
  return [...providers].sort((a, b) => {
    const delta = scores.get(b)! - scores.get(a)!;
    if (Math.abs(delta) > Number.EPSILON) return delta;
    const statusDelta = getGatewayStatusSortRank(status.get(a)) - getGatewayStatusSortRank(status.get(b));
    if (statusDelta) return statusDelta;
    if (creatorId) {
      const aCreator = a.provider.api_provider_id === creatorId;
      const bCreator = b.provider.api_provider_id === creatorId;
      if (aCreator !== bCreator) return aCreator ? -1 : 1;
    }
    return name(a).localeCompare(name(b));
  });
}

/** The website's data policy shield: private (green), logs (amber), trains (red), otherwise unknown. */
export type DataPolicyTier = "private" | "logs" | "trains" | "unknown";

export function dataPolicyTier(provider: ProviderPricing["provider"]): DataPolicyTier {
  const tier = String(provider.data_policy_tier ?? "").trim().toLowerCase();
  if (tier === "private" || tier === "logs" || tier === "trains") return tier;
  const training = String(provider.prompt_training_policy ?? "").trim().toLowerCase();
  if (training === "may_train" || training === "opt_out_available") return "trains";
  if (training === "no_train" || training === "enterprise_no_train") return provider.zero_data_retention === true ? "private" : "logs";
  return "unknown";
}

export const DATA_POLICY_LABELS: Record<DataPolicyTier, string> = {
  private: "No training or logging",
  logs: "No training; may keep logs",
  trains: "May train on inputs",
  unknown: "Data policy not known",
};

const REGION_LABELS: Record<string, string> = { global: "Global", us: "US", eu: "EU", uk: "UK", gb: "UK" };
export const regionLabel = (region: string) => REGION_LABELS[region.trim().toLowerCase()] ?? region.trim().toUpperCase();

/** Where requests run: the routes' execution regions, else the provider's defaults. */
export function executionRegions(provider: ProviderPricing, plan: string) {
  const fromRoutes = modelScopeForPlan(provider, plan).map((model) => model.execution_region).filter((value): value is string => Boolean(value?.trim()));
  const regions = fromRoutes.length ? fromRoutes : provider.provider.default_execution_regions ?? [];
  return [...new Set(regions.map(regionLabel))];
}

export const RESIDENCY_LABELS: Record<string, string> = {
  provider_managed: "Provider managed",
  customer_selectable: "Customer selectable",
  account_selected: "Account selected",
};

/** Context window and output limit across the tier's routes. */
export function routeLimits(provider: ProviderPricing, plan: string) {
  const routes = modelScopeForPlan(provider, plan);
  return {
    context: Math.max(0, ...routes.map((route) => route.context_length ?? 0)),
    maxOutput: Math.max(0, ...routes.map((route) => route.max_output_tokens ?? 0)),
  };
}
