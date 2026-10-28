/**
 * Which reasoning efforts and service tiers a model's routes accept.
 * Ported from apps/web/src/components/(chat)/playground/reasoningEffortSupport.ts and
 * serviceTierSupport.ts: the same parsing of each route's capability params, intersected across
 * the routes a request could use (all of them on Auto, or the one chosen provider).
 */

export type ReasoningEffort = "none" | "instant" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ServiceTier = "standard" | "priority" | "ultrafast" | "flex";

export type ReasoningEffortSupport = { supportedValues: ReasoningEffort[]; defaultValue?: ReasoningEffort };
export type ServiceTierSupport = { supportedValues: ServiceTier[]; defaultValue?: ServiceTier };

export const REASONING_EFFORT_ORDER: ReasoningEffort[] = ["none", "instant", "minimal", "low", "medium", "high", "xhigh", "max"];

/** The website's REASONING_OPTIONS labels, in sentence case. */
export const REASONING_LABELS: Record<ReasoningEffort, string> = {
  none: "None",
  instant: "Instant",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

const SERVICE_TIER_ORDER: ServiceTier[] = ["standard", "priority", "ultrafast", "flex"];

/** SERVICE_TIER_OPTIONS: `priority` is sold as Fast. */
export const SERVICE_TIER_LABELS: Record<ServiceTier, string> = { standard: "Standard", priority: "Fast", ultrafast: "Ultrafast", flex: "Flex" };

const TEXT_GENERATION_CAPABILITY_IDS = new Set(["text.generate", "responses", "chat.completions", "text.completions", "completions"]);
const SERVICE_TIER_PARAMETER_IDS = new Set(["service_tier", "service-tier", "service.tier", "servicetier"]);
const REASONING_EFFORTS = new Set<string>(REASONING_EFFORT_ORDER);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ---- Reasoning effort -------------------------------------------------------

function parseEffort(value: unknown): ReasoningEffort | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return REASONING_EFFORTS.has(normalized) ? (normalized as ReasoningEffort) : null;
}

function parseEfforts(value: unknown): ReasoningEffort[] {
  if (!Array.isArray(value)) return [];
  const parsed = new Set<ReasoningEffort>();
  for (const entry of value) {
    const effort = parseEffort(entry);
    if (effort) parsed.add(effort);
  }
  return REASONING_EFFORT_ORDER.filter((effort) => parsed.has(effort));
}

function effortSupportFromConfig(value: unknown): ReasoningEffortSupport | null {
  if (!isRecord(value)) return null;
  const supportedValues = parseEfforts(value.supported_values ?? value.values ?? value.enum);
  if (!supportedValues.length) return null;
  const defaultValue = parseEffort(value.default_value ?? value.default ?? value.provider_default);
  return { supportedValues, ...(defaultValue && supportedValues.includes(defaultValue) ? { defaultValue } : {}) };
}

function intersect<T extends string>(order: T[], supports: { supportedValues: T[]; defaultValue?: T }[]): { supportedValues: T[]; defaultValue?: T } | null {
  if (!supports.length) return null;
  const common = new Set(supports[0]?.supportedValues ?? []);
  for (const support of supports.slice(1)) {
    const values = new Set(support.supportedValues);
    for (const value of common) if (!values.has(value)) common.delete(value);
  }
  const supportedValues = order.filter((value) => common.has(value));
  const defaults = supports.map((support) => support.defaultValue);
  const first = defaults[0];
  const defaultValue = first && defaults.every((value) => value === first) && supportedValues.includes(first) ? first : undefined;
  return { supportedValues, ...(defaultValue ? { defaultValue } : {}) };
}

export const intersectReasoningSupports = (supports: (ReasoningEffortSupport | null | undefined)[]) =>
  intersect(REASONING_EFFORT_ORDER, supports.filter((support): support is ReasoningEffortSupport => Boolean(support)));

/** Explicit effort support from one route's params, in either the current list form or the legacy object form. */
export function getRouteReasoningEffortSupport(capabilityParams: unknown): ReasoningEffortSupport | null {
  if (Array.isArray(capabilityParams)) {
    const id = (entry: Record<string, unknown>) => String(entry.param_id ?? entry.name ?? "").trim().toLowerCase();
    const enumParams = capabilityParams.filter((entry): entry is Record<string, unknown> => isRecord(entry) && ["reasoning", "reasoning_effort", "reasoning.effort"].includes(id(entry)));
    const effortParams = enumParams.filter((entry) => id(entry) === "reasoning_effort" || id(entry) === "reasoning.effort");
    const parsedEffort = effortParams.map(effortSupportFromConfig).filter((support): support is ReasoningEffortSupport => Boolean(support));
    const parsed = enumParams.map(effortSupportFromConfig).filter((support): support is ReasoningEffortSupport => Boolean(support));
    return intersectReasoningSupports(parsedEffort.length ? parsedEffort : parsed);
  }
  if (!isRecord(capabilityParams)) return null;
  const reasoning = isRecord(capabilityParams.reasoning) ? capabilityParams.reasoning : null;
  const candidates = [capabilityParams["reasoning.effort"], capabilityParams.reasoning_effort, reasoning?.effort, reasoning].filter(isRecord);
  return intersectReasoningSupports(candidates.map(effortSupportFromConfig));
}

/** A route's effort support across its text-generation capabilities (getModelRouteSupport). */
export function routeReasoningSupport(capabilityParamsById: unknown): ReasoningEffortSupport | null {
  if (!isRecord(capabilityParamsById)) return null;
  return intersectReasoningSupports(
    Object.entries(capabilityParamsById)
      .filter(([capabilityId]) => TEXT_GENERATION_CAPABILITY_IDS.has(capabilityId.trim().toLowerCase()))
      .map(([, params]) => getRouteReasoningEffortSupport(params)),
  );
}

/** The effort a request uses: the chosen one when supported, else the gateway default, else medium. */
export function resolveReasoningEffort(effort: ReasoningEffort, support: ReasoningEffortSupport | null | undefined): ReasoningEffort {
  if (!support || !support.supportedValues.length) return effort === "instant" ? "medium" : effort;
  if (support.supportedValues.includes(effort)) return effort;
  if (support.defaultValue) return support.defaultValue;
  if (support.supportedValues.includes("medium")) return "medium";
  return support.supportedValues[0] ?? effort;
}

// ---- Service tiers ----------------------------------------------------------

function parseServiceTier(value: unknown): ServiceTier | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "standard" || normalized === "default" || normalized === "auto") return "standard";
  if (normalized === "priority" || normalized === "fast") return "priority";
  if (normalized === "ultrafast") return "ultrafast";
  if (normalized === "flex") return "flex";
  return null;
}

function parseServiceTiers(value: unknown): ServiceTier[] {
  if (!Array.isArray(value)) return [];
  const parsed = new Set<ServiceTier>();
  for (const entry of value) {
    const tier = parseServiceTier(isRecord(entry) ? entry.value ?? entry.id ?? entry.name ?? entry.tier : entry);
    if (tier) parsed.add(tier);
  }
  return SERVICE_TIER_ORDER.filter((tier) => parsed.has(tier));
}

function hasPositiveTierNote(notes: string, tier: "priority" | "flex") {
  const names = tier === "priority" ? "priority|fast" : "flex";
  if (new RegExp(`(?:not|no|without|unavailable|unsupported).{0,32}\\b(?:${names})\\b|\\b(?:${names})\\b.{0,32}(?:not available|not supported|unavailable|unsupported)`, "i").test(notes)) return false;
  return new RegExp(`(?:available|support(?:ed)?|offer(?:ed)?|processing|tier).{0,48}\\b(?:${names})\\b|\\b(?:${names})\\b.{0,48}(?:available|support(?:ed)?|offer(?:ed)?|processing|tier)`, "i").test(notes);
}

function tierSupportFromConfig(value: unknown): ServiceTierSupport | null {
  if (typeof value === "string") {
    const tier = parseServiceTier(value);
    return { supportedValues: [tier ?? "standard"] };
  }
  if (Array.isArray(value)) {
    const supportedValues = parseServiceTiers(value);
    return supportedValues.length ? { supportedValues } : null;
  }
  if (!isRecord(value)) return null;
  const supportedValues = parseServiceTiers(value.supported_values ?? value.supportedValues ?? value.values ?? value.enum);
  const defaultValue = parseServiceTier(value.default_value ?? value.default ?? value.provider_default ?? value.providerDefault);
  if (supportedValues.length) return { supportedValues, ...(defaultValue && supportedValues.includes(defaultValue) ? { defaultValue } : {}) };
  const supported = new Set<ServiceTier>(["standard"]);
  const notes = typeof value.notes === "string" ? value.notes : "";
  if (hasPositiveTierNote(notes, "priority")) supported.add("priority");
  if (hasPositiveTierNote(notes, "flex")) supported.add("flex");
  return { supportedValues: SERVICE_TIER_ORDER.filter((tier) => supported.has(tier)), ...(defaultValue && supported.has(defaultValue) ? { defaultValue } : {}) };
}

export const intersectServiceTierSupports = (supports: (ServiceTierSupport | null | undefined)[]) =>
  intersect(SERVICE_TIER_ORDER, supports.filter((support): support is ServiceTierSupport => Boolean(support)));

const normalizeParameterId = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase().replace(/-/g, "_") : "");
const isServiceTierParameter = (value: unknown) => typeof value === "string" && SERVICE_TIER_PARAMETER_IDS.has(normalizeParameterId(value));
const isServiceTierConfig = (value: unknown) => isRecord(value) && SERVICE_TIER_PARAMETER_IDS.has(normalizeParameterId(value.param_id ?? value.paramId ?? value.name ?? value.id));

/** Service-tier support from one route's params (getRouteServiceTierSupport). */
export function getRouteServiceTierSupport(capabilityParams: unknown): ServiceTierSupport | null {
  if (Array.isArray(capabilityParams)) {
    const candidates = capabilityParams.filter((entry) => isServiceTierParameter(entry) || isServiceTierConfig(entry));
    if (!candidates.length) return null;
    return intersectServiceTierSupports(candidates.map((entry) => (isServiceTierConfig(entry) ? tierSupportFromConfig(entry) : { supportedValues: ["standard"] })));
  }
  if (!isRecord(capabilityParams)) return null;
  const direct = [capabilityParams.service_tier, capabilityParams.serviceTier, capabilityParams["service.tier"]].filter((candidate) => candidate !== undefined);
  if (direct.length) return intersectServiceTierSupports(direct.map(tierSupportFromConfig));
  return isServiceTierConfig(capabilityParams) ? tierSupportFromConfig(capabilityParams) : null;
}

/** A route's tiers (getModelRouteServiceTierSupport): its listed tiers, else what its params say, else Standard. */
export function routeServiceTierSupport(route: { serviceTiers?: unknown; capabilityParamsById?: unknown; capabilities?: string[] }): ServiceTierSupport | null {
  if (Array.isArray(route.serviceTiers)) {
    const supportedValues = parseServiceTiers(route.serviceTiers);
    return { supportedValues: supportedValues.length ? supportedValues : ["standard"] };
  }
  if (isRecord(route.capabilityParamsById)) {
    const textRoutes = Object.entries(route.capabilityParamsById).filter(([capabilityId]) => TEXT_GENERATION_CAPABILITY_IDS.has(capabilityId.trim().toLowerCase()));
    if (textRoutes.length) return intersectServiceTierSupports(textRoutes.map(([, params]) => getRouteServiceTierSupport(params) ?? { supportedValues: ["standard"] }));
  }
  return (route.capabilities ?? []).some((id) => TEXT_GENERATION_CAPABILITY_IDS.has(id.trim().toLowerCase())) ? { supportedValues: ["standard"] } : null;
}

/** The tiers to offer: the supported ones, or just Standard when nothing is known. */
export function serviceTierOptions(support: ServiceTierSupport | null | undefined): ServiceTier[] {
  if (!support || !support.supportedValues.length) return ["standard"];
  return SERVICE_TIER_ORDER.filter((tier) => support.supportedValues.includes(tier));
}

// ---- Per model --------------------------------------------------------------

export type RouteCapabilities = { providerId: string; reasoning: ReasoningEffortSupport | null; serviceTiers: ServiceTierSupport | null };

/** The routes a request can use: every route on Auto, or only the chosen provider's. */
function candidateRoutes<T extends RouteCapabilities>(routes: T[], providerId?: string | null) {
  const provider = providerId?.trim();
  return provider && provider !== "auto" ? routes.filter((route) => route.providerId === provider) : routes;
}

/** getModelReasoningEffortSupport: efforts every candidate route accepts. */
export function modelReasoningSupport(routes: RouteCapabilities[], providerId?: string | null) {
  return intersectReasoningSupports(candidateRoutes(routes, providerId).map((route) => route.reasoning));
}

/** getModelServiceTierSupport: tiers every candidate route accepts. */
export function modelServiceTierSupport(routes: RouteCapabilities[], providerId?: string | null) {
  return intersectServiceTierSupports(candidateRoutes(routes, providerId).map((route) => route.serviceTiers));
}
