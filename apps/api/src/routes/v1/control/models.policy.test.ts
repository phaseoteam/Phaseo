import { describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => { throw new Error("no database in these tests"); },
    getCache: () => ({ get: async () => null, put: async () => undefined }),
    dispatchBackground: () => undefined,
}));

import { buildWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import { filterModelsForPolicy, modelsForPolicy, policyRestrictsModels, type PolicyRouteFacts, type ProviderDataFacts } from "./models.policy";

const offer = (provider: string, price = "0.000001", status = "active") => ({
    provider: { id: provider, name: provider },
    status,
    routable: status === "active",
    pricing: { pricing_plan: "standard", meters: { input_text_tokens: { provider_id: provider, unit: "token", unit_size: 1, price_per_unit: price, currency: "USD" } } },
});
const model = (id: string, offers: ReturnType<typeof offer>[]) => ({
    id,
    name: id,
    offers,
    availability: {
        status: "active",
        provider_count: offers.length,
        active_provider_count: offers.filter((value) => value.status === "active").length,
        coming_soon_provider_count: offers.filter((value) => value.status === "coming_soon").length,
        inactive_provider_count: 0,
    },
});
const catalogue = () => [
    model("openai/gpt-6", [offer("openai"), offer("azure")]),
    model("anthropic/claude-sonnet-5", [offer("anthropic"), offer("google-vertex"), offer("amazon-bedrock", "0.000002", "coming_soon")]),
    model("deepseek/deepseek-v4", [offer("deepseek")]),
];
const facts = (entries: Record<string, ProviderDataFacts>) => new Map(Object.entries(entries));
const confirmed = (tier: string, zdr = false) => ({ zeroDataRetention: zdr, dataPolicyTier: tier, dataPolicyConfidence: "confirmed", promptTrainingPolicy: "unknown" } as ProviderDataFacts);
const ids = (models: { id: string }[]) => models.map((value) => value.id);
const providers = (models: { id: string; offers: { provider: { id: string } }[] }[], id: string) => models.find((value) => value.id === id)?.offers.map((value) => value.provider.id);

describe("models for a key's policy", () => {
    it("leaves the catalogue as it is when nothing is restricted", async () => {
        const policy = buildWorkspacePolicy({});
        expect(policyRestrictsModels(policy)).toBe(false);
        const models = catalogue();
        // No restriction, so no provider facts are read (the database mock throws).
        expect(await modelsForPolicy(models, policy)).toBe(models);
    });

    it("removes a disallowed provider's offers and recounts availability", () => {
        const policy = buildWorkspacePolicy({ globalSettings: { provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["azure", "amazon-bedrock"] } });
        const models = filterModelsForPolicy(catalogue(), policy, new Map());
        expect(ids(models)).toEqual(["openai/gpt-6", "anthropic/claude-sonnet-5", "deepseek/deepseek-v4"]);
        expect(providers(models, "openai/gpt-6")).toEqual(["openai"]);
        expect(models.find((value) => value.id === "anthropic/claude-sonnet-5")?.availability).toMatchObject({ provider_count: 2, active_provider_count: 2, coming_soon_provider_count: 0, inactive_provider_count: 0 });
    });

    it("leaves out a model whose every provider is disallowed", () => {
        const policy = buildWorkspacePolicy({ guardrails: [{ id: "g1", provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["deepseek"] }] });
        expect(ids(filterModelsForPolicy(catalogue(), policy, new Map()))).not.toContain("deepseek/deepseek-v4");
    });

    it("keeps only allowlisted providers, intersected across guardrails", () => {
        const policy = buildWorkspacePolicy({
            globalSettings: { provider_restriction_mode: "allowlist", provider_restriction_provider_ids: ["openai", "anthropic", "azure"] },
            guardrails: [{ id: "g1", provider_restriction_mode: "allowlist", provider_restriction_provider_ids: ["openai", "anthropic"] }],
        });
        const models = filterModelsForPolicy(catalogue(), policy, new Map());
        expect(ids(models)).toEqual(["openai/gpt-6", "anthropic/claude-sonnet-5"]);
        expect(providers(models, "openai/gpt-6")).toEqual(["openai"]);
    });

    it("applies model allow and block lists", () => {
        const allow = buildWorkspacePolicy({ guardrails: [{ id: "g1", model_restriction_mode: "allowlist", allowed_api_model_ids: ["openai/gpt-6"] }] });
        expect(ids(filterModelsForPolicy(catalogue(), allow, new Map()))).toEqual(["openai/gpt-6"]);
        const block = buildWorkspacePolicy({ globalSettings: { model_restriction_mode: "blocklist", model_restriction_model_ids: ["openai/gpt-6"] } });
        expect(ids(filterModelsForPolicy(catalogue(), block, new Map()))).toEqual(["anthropic/claude-sonnet-5", "deepseek/deepseek-v4"]);
    });

    it("applies zero data retention with each provider's facts", () => {
        const policy = buildWorkspacePolicy({ globalSettings: { privacy_zdr_only: true } });
        const models = filterModelsForPolicy(catalogue(), policy, facts({
            openai: confirmed("logs", false), azure: confirmed("private", true),
            anthropic: confirmed("private", true), "google-vertex": confirmed("logs", false),
        }));
        expect(ids(models)).toEqual(["openai/gpt-6", "anthropic/claude-sonnet-5"]);
        expect(providers(models, "openai/gpt-6")).toEqual(["azure"]);
        expect(providers(models, "anthropic/claude-sonnet-5")).toEqual(["anthropic"]);
    });

    it("treats providers without confirmed facts as the request pipeline does: not allowed under privacy rules", () => {
        const policy = buildWorkspacePolicy({ guardrails: [{ id: "g1", privacy_enable_paid_may_train: false }] });
        const models = filterModelsForPolicy(catalogue(), policy, facts({ openai: confirmed("trains"), azure: confirmed("private", true) }));
        expect(providers(models, "openai/gpt-6")).toEqual(["azure"]);
        expect(ids(models)).not.toContain("deepseek/deepseek-v4");
    });

    it("tells free from paid offers for the training rules", () => {
        const policy = buildWorkspacePolicy({ guardrails: [{ id: "g1", privacy_enable_free_may_train: false }] });
        const list = [model("x/free", [offer("free-host", "0")]), model("x/paid", [offer("paid-host", "0.000001")])];
        const models = filterModelsForPolicy(list, policy, facts({ "free-host": confirmed("trains"), "paid-host": confirmed("trains") }));
        expect(ids(models)).toEqual(["x/paid"]);
    });

    it("rebuilds a model's prices from the offers left, so a removed provider's cheaper price isn't advertised", () => {
        const policy = buildWorkspacePolicy({ globalSettings: { provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["cheap"] } });
        const list = [{ ...model("x/m", [offer("cheap", "0.000001"), offer("mid", "0.000002"), offer("dear", "0.000003")]),
            pricing: { pricing_plan: "standard", meters: { input_text_tokens: { provider_id: "cheap", unit: "token", unit_size: 1, price_per_unit: "0.000001", currency: "USD" }, output_text_tokens: null } } }];
        const [kept] = filterModelsForPolicy(list, policy, new Map());
        expect(kept.pricing).toEqual({ pricing_plan: "standard", meters: { input_text_tokens: { provider_id: "mid", unit: "token", unit_size: 1, price_per_unit: "0.000002", currency: "USD" }, output_text_tokens: null } });
    });

    it("applies each route's capability data policy over the provider's facts, as requests do", () => {
        const zdr = buildWorkspacePolicy({ globalSettings: { privacy_zdr_only: true } });
        const list = [model("x/m", [offer("verified"), offer("excluded"), offer("plain")])];
        const providerFacts = facts({ verified: confirmed("logs", false), excluded: confirmed("private", true), plain: confirmed("private", true) });
        const routes = new Map([["x/m", new Map<string, PolicyRouteFacts>([
            // The provider has no ZDR, but this route is verified ZDR.
            ["verified", { capabilityParams: { data_policy: { zeroDataRetention: true, tier: "private", confidence: "confirmed" } } }],
            // The provider is ZDR, but this route explicitly isn't.
            ["excluded", { capabilityParams: { data_policy: { zeroDataRetention: false } } }],
        ])]]);
        expect(providers(filterModelsForPolicy(list, zdr, providerFacts, routes), "x/m")?.sort()).toEqual(["plain", "verified"]);
        // A catalogue guarantee past its date counts for nothing.
        const expired = new Map([["x/m", new Map<string, PolicyRouteFacts>([["plain", { capabilityParams: { data_policy: { catalogManaged: true, validUntil: "2020-01-01T00:00:00Z", zeroDataRetention: true } } }]])]]);
        expect(providers(filterModelsForPolicy(list, zdr, providerFacts, expired), "x/m")).toEqual(["excluded"]);
    });

    it("checks the Free router's routes by the concrete models they serve", () => {
        const router = [model("phaseo/free", [offer("host-a", "0"), offer("host-b", "0")])];
        const routes = new Map([["phaseo/free", new Map<string, PolicyRouteFacts>([["host-a", { apiModelId: "x/free-a" }], ["host-b", { apiModelId: "x/free-b" }]])]]);
        // An allowlist of a concrete free model keeps the router, with that model's route only.
        const allow = buildWorkspacePolicy({ guardrails: [{ id: "g1", model_restriction_mode: "allowlist", allowed_api_model_ids: ["x/free-a"] }] });
        expect(providers(filterModelsForPolicy(router, allow, new Map(), routes), "phaseo/free")).toEqual(["host-a"]);
        // A blocked concrete model's route goes.
        const block = buildWorkspacePolicy({ guardrails: [{ id: "g1", model_restriction_mode: "blocklist", allowed_api_model_ids: ["x/free-b"] }] });
        expect(providers(filterModelsForPolicy(router, block, new Map(), routes), "phaseo/free")).toEqual(["host-a"]);
    });

    it("rebuilds endpoints, parameters and status from the offers left", () => {
        const policy = buildWorkspacePolicy({ globalSettings: { provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["tools-host"] } });
        const withCaps = (provider: string, status: string, endpoints: string[], parameters: string[]) => ({ ...offer(provider, "0.000001", status), endpoints, capabilities: { parameters, parameter_details: Object.fromEntries(parameters.map((name) => [name, { supported: true }])) } });
        const list = [{
            ...model("x/m", [withCaps("tools-host", "active", ["text.generate", "responses"], ["temperature", "tools"]), withCaps("plain-host", "coming_soon", ["text.generate"], ["temperature"])]),
            capabilities: { endpoints: ["responses", "text.generate"], parameters: ["temperature", "tools"], parameter_details: { temperature: { supported: true }, tools: { supported: true } } },
        }];
        list[0].availability.status = "active";
        const [kept] = filterModelsForPolicy(list, policy, new Map());
        // Only the blocked provider served tools and responses, so neither is advertised.
        expect(kept.capabilities?.endpoints).toEqual(["text.generate"]);
        expect(kept.capabilities?.parameters).toEqual(["temperature"]);
        expect(Object.keys(kept.capabilities?.parameter_details ?? {})).toEqual(["temperature"]);
        // The active provider went; the one left is coming soon.
        expect(kept.availability).toMatchObject({ status: "coming_soon", active_provider_count: 0, coming_soon_provider_count: 1 });
    });

    it("lets a workspace's private models through privacy rules", () => {
        const policy = buildWorkspacePolicy({ globalSettings: { privacy_zdr_only: true } });
        const models = filterModelsForPolicy([model("acme/internal", [offer("private-model")])], policy, new Map());
        expect(ids(models)).toEqual(["acme/internal"]);
    });
});
