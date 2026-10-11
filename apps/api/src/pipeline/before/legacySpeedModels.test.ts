import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeLegacySpeedModel } from "./legacySpeedModels";
import { canonicalizeProviderQualifiedModelRequest } from "../requestRouting";
import { applyServiceTierRouting } from "./serviceTierRouting";

const aliasState = vi.hoisted(() => ({ missing: false, error: false, invalid: false }));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => ({ from: () => {
	let slug = "";
	const query = { select: () => query, eq: (key: string, value: string) => { if (key === "model_slug") slug = value; return query; },
		maybeSingle: async () => ({ data: { metadata: aliasState.missing ? {} : { serving_tier: { model_slug: slug.replace(/-(highspeed|ultraspeed)$/, ""), name: aliasState.invalid ? "standard" : "fast" } } }, error: aliasState.error ? { message: "unavailable" } : null }) };
	return query;
} }) }));

describe("legacy speed model compatibility", () => {
	beforeEach(() => Object.assign(aliasState, { missing: false, error: false, invalid: false }));
	it.each(["chat.completions", "responses", "messages"] as const)("keeps UltraSpeed callers on fast for %s", async (endpoint) => {
		const body = { model: "xiaomi/mimo-v2.5-pro-ultraspeed", messages: [] };
		expect(await normalizeLegacySpeedModel(body, endpoint)).toEqual({ ...body, model: "xiaomi/mimo-v2.5-pro", service_tier: "fast" });
		expect(body.model).toBe("xiaomi/mimo-v2.5-pro-ultraspeed");
	});
	it.each([
		["minimax/minimax-m2.5-highspeed", "minimax/minimax-m2.5"],
		["moonshotai/kimi-k2.7-code-highspeed", "moonshotai/kimi-k2.7-code"],
		["xiaomi/mimo-v2.5-pro-ultraspeed", "xiaomi/mimo-v2.5-pro"],
	])("resolves %s to its base identity and fast tier", async (model, base) => {
		expect(await normalizeLegacySpeedModel({ model }, "responses")).toEqual({ model: base, service_tier: "fast" });
	});
	it("retains explicit tier choices and lets validation reject invalid values", async () => {
		for (const tier of ["standard", "priority", "ultrafast", "invalid", 123]) {
			expect(await normalizeLegacySpeedModel({ model: "minimax/minimax-m2.5-highspeed", serviceTier: tier }, "responses")).toEqual({ model: "minimax/minimax-m2.5", serviceTier: tier });
		}
	});
	it("retains provider qualification after canonicalization", async () => {
		const qualified = canonicalizeProviderQualifiedModelRequest({ model: "xiaomi:xiaomi/mimo-v2.5-pro-ultraspeed" });
		const normalized = await normalizeLegacySpeedModel(qualified.body, "responses");
		expect(normalized.model).toBe("xiaomi/mimo-v2.5-pro");
		expect(normalized.service_tier).toBe("fast");
		expect(normalized.provider).toEqual(qualified.body.provider);
		expect(qualified.selection).not.toBeNull();
	});
	it("does not reinterpret unrelated models or non-text requests", async () => {
		const unknown = { model: "acme/model-ultraspeed" };
		expect(await normalizeLegacySpeedModel(unknown, "responses")).toBe(unknown);
		const media = { model: "xiaomi/mimo-v2.5-pro-ultraspeed" };
		expect(await normalizeLegacySpeedModel(media, "embeddings")).toBe(media);
	});
	it("preserves the standalone route until its serving-tier cutover exists", async () => {
		aliasState.missing = true;
		const body = { model: "xiaomi/mimo-v2.5-pro-ultraspeed" };
		expect(await normalizeLegacySpeedModel(body, "responses")).toBe(body);
	});
	it("selects the migrated MiMo fast offer with its own prices, never the standard or ultrafast offer", async () => {
		const body = await normalizeLegacySpeedModel({ model: "xiaomi/mimo-v2.5-pro-ultraspeed" }, "responses");
		const candidates = ["standard", "fast", "ultrafast"].map((name) => ({
			providerId: "xiaomi", apiModelId: body.model, providerModelSlug: `native-${name}`,
			capabilityParams: { service_tier: { provider_catalog: { name, upstream: null } } },
			pricingCard: { rules: [{ pricing_plan: name === "fast" ? "priority" : name, price_per_unit: name === "fast" ? "4.35" : "0.435" }] },
		}));
		const routed = await applyServiceTierRouting({ body, candidates: candidates as never, capability: "text.generate" });
		expect(routed.candidates).toEqual([candidates[1]]);
		expect(routed.diagnostics.requestedPlan).toBe("priority");
	});
	it("fails closed on lookup failures or classifications that would lose the speed choice", async () => {
		aliasState.error = true;
		await expect(normalizeLegacySpeedModel({ model: "xiaomi/mimo-v2.5-pro-ultraspeed" }, "responses")).rejects.toThrow("lookup_failed");
		aliasState.error = false; aliasState.invalid = true;
		await expect(normalizeLegacySpeedModel({ model: "xiaomi/mimo-v2.5-pro-ultraspeed" }, "responses")).rejects.toThrow("tier_invalid");
	});
});
