import { describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => { throw new Error("no database in these tests"); },
    getCache: () => ({ get: async () => null, put: async () => undefined }),
    dispatchBackground: () => undefined,
}));

import { buildWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import { filterModelsForPolicy, modelsForPolicy, policyRestrictsModels, type ProviderDataFacts } from "./models.policy";

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

    it("lets a workspace's private models through privacy rules", () => {
        const policy = buildWorkspacePolicy({ globalSettings: { privacy_zdr_only: true } });
        const models = filterModelsForPolicy([model("acme/internal", [offer("private-model")])], policy, new Map());
        expect(ids(models)).toEqual(["acme/internal"]);
    });
});
