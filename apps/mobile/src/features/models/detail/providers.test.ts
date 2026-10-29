import type { ProviderPricing } from "@/lib/api/models";
import {
  dataPolicyTier, defaultPlan, executionRegions, inversePriceWeights, isRouteVariant, listingCategory, providerDisplayName, providerLogoId, providerPlans, providerStatus,
  runtimeStatsFromHealth, sortProviders, statsKey,
} from "./providers";

const make = (id: string, name: string, options: Partial<ProviderPricing["provider"]> & { route?: Partial<ProviderPricing["provider_models"][number]>; plans?: string[] } = {}): ProviderPricing => {
  const { route, plans = ["standard"], ...provider } = options;
  return {
    provider: { api_provider_id: id, api_provider_name: name, status: "active", routing_status: "active", ...provider },
    provider_models: [{ is_active_gateway: true, endpoint: "text.generate", phaseo_status: "enabled", provider_availability_status: "available", capability_status: "active", access_scope: "public", ...route }],
    pricing_rules: plans.map((plan) => ({ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: 1, pricing_plan: plan })),
  };
};

// The Claude Haiku 5.5 providers as the website lists them on 18 Oct 2026.
const anthropic = make("anthropic", "Anthropic", { plans: ["standard", "batch"], default_execution_regions: ["global", "us"] });
const bedrock = make("amazon-bedrock", "Amazon Bedrock", { route: { is_active_gateway: false, phaseo_status: "blocked", routing_status: "disabled" } });
const aws = make("anthropic-aws", "Anthropic", { offer_label: "AWS", offer_scope: "specialized", provider_family_id: "anthropic", route: { is_active_gateway: false, phaseo_status: "blocked" } });
const azure = make("azure", "Azure", { route: { is_active_gateway: false, phaseo_status: "blocked" } });
const vertex = make("google-vertex", "Google Vertex", { route: { is_active_gateway: false, phaseo_status: "blocked" } });
const vertexEu = make("google-vertex-eu", "Google Vertex", { offer_label: "EU", offer_scope: "regional", route: { is_active_gateway: false, phaseo_status: "blocked" } });

describe("provider rows", () => {
  test("use the website's display names and logos", () => {
    expect(providerDisplayName(aws.provider)).toBe("Claude Platform for AWS");
    expect(providerDisplayName(vertexEu.provider)).toBe("Google Vertex (EU)");
    expect(providerDisplayName(anthropic.provider)).toBe("Anthropic");
    expect(providerLogoId(aws.provider)).toBe("aws");
  });

  test("status: active routes are routable, blocked ones disabled", () => {
    expect(providerStatus(anthropic)).toBe("active");
    expect(providerStatus(bedrock)).toBe("disabled");
    expect(listingCategory(anthropic, "active")).toBe("routable");
    expect(listingCategory(bedrock, "disabled")).toBe("inactive");
    expect(providerStatus(make("x", "X", { route: { provider_availability_status: "coming_soon" } }))).toBe("coming_soon");
    expect(listingCategory(make("ext", "Ext", { status: "external" }), "active")).toBe("external");
  });

  test("tiers in the website's order, standard by default", () => {
    expect(providerPlans(make("p", "P", { plans: ["batch", "priority", "standard"] }))).toEqual(["standard", "priority", "batch"]);
    expect(defaultPlan(anthropic)).toBe("standard");
    expect(defaultPlan(make("f", "F", { plans: ["free", "batch"] }))).toBe("free");
  });

  test("regional and tier routes go under additional routing options; Claude Platform on AWS does not", () => {
    expect(isRouteVariant(vertexEu, "standard")).toBe(true);
    expect(isRouteVariant(aws, "standard")).toBe(false);
    expect(isRouteVariant(anthropic, "batch")).toBe(true);
    expect(isRouteVariant(vertex, "standard")).toBe(false);
  });

  test("privacy shield and region pin", () => {
    expect(dataPolicyTier({ data_policy_tier: "logs" })).toBe("logs");
    expect(dataPolicyTier({ prompt_training_policy: "no_train", zero_data_retention: true })).toBe("private");
    expect(dataPolicyTier({ prompt_training_policy: "may_train" })).toBe("trains");
    expect(dataPolicyTier({})).toBe("unknown");
    expect(executionRegions(anthropic, "standard")).toEqual(["Global", "US"]);
  });
});

describe("routing order", () => {
  test("routable first, then status, the creator, then name", () => {
    const sorted = sortProviders([vertex, vertexEu, azure, aws, bedrock, anthropic], { stats: new Map(), creatorId: "anthropic", basePrice: () => 1 });
    // Ties among blocked routes sort by catalogue name: "Amazon Bedrock" < "Anthropic" (on AWS) < "Azure" < "Google Vertex".
    expect(sorted.map((provider) => provider.provider.api_provider_id)).toEqual(["anthropic", "amazon-bedrock", "anthropic-aws", "azure", "google-vertex", "google-vertex-eu"]);
  });

  test("among routable providers, cheaper and healthier routes rank higher", () => {
    const cheap = make("cheap", "Cheap");
    const pricey = make("pricey", "Pricey");
    const stats = runtimeStatsFromHealth([
      { provider_id: "cheap", service_tier: "standard", requests: 500, requests_30m: 5, health_requests: 500, uptime_pct: 99, request_success_pct: 99, percentile_latency_ms: 800, percentile_throughput: 60 },
      { provider_id: "pricey", service_tier: "standard", requests: 500, requests_30m: 5, health_requests: 500, uptime_pct: 99, request_success_pct: 99, percentile_latency_ms: 800, percentile_throughput: 60 },
    ]);
    const sorted = sortProviders([pricey, cheap], { stats, basePrice: (provider) => (provider.provider.api_provider_id === "cheap" ? 1 : 4) });
    expect(sorted.map((provider) => provider.provider.api_provider_id)).toEqual(["cheap", "pricey"]);
  });

  test("price weights favour cheaper routes, with free routes floored", () => {
    const weights = inversePriceWeights([{ id: "a", price: 1 }, { id: "b", price: 2 }, { id: "free", price: 0 }, { id: "none", price: null }]);
    expect(weights.get("free")).toBe(1);
    expect(weights.get("a")).toBeCloseTo(0.01);
    expect(weights.get("b")).toBeCloseTo(0.0025);
    expect(weights.get("none")).toBe(0);
  });
});

test("runtime stats prefer 30-minute figures and hide uptime without health requests", () => {
  const stats = runtimeStatsFromHealth([
    { provider_id: "a", service_tier: "default", requests: 10, requests_30m: 1, health_requests: 0, uptime_pct: 100, percentile_latency_ms_30m: 500, percentile_latency_ms: 900, avg_throughput: 40 },
    { provider_id: "a", service_tier: "fast", requests: 3, requests_30m: 0, health_requests: 3, uptime_pct: 66.7, avg_latency_ms: 300 },
  ]);
  expect(stats.get(statsKey("a"))).toMatchObject({ latencyMs: 500, throughput: 40, uptimePct: null });
  expect(stats.get(statsKey("a", "priority"))).toMatchObject({ latencyMs: 300, uptimePct: 66.7 });
});
