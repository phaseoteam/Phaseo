import { describe, expect, it } from "vitest";
import { normalizeProviderCatalog } from "./provider-catalog";
import { normalizedCatalogDocument } from "./provider-catalog-overrides";
import { normalizeEmpirioLabsCatalog } from "./provider-catalog-empiriolabs";

function model(id: string, upstream: string, price: number) {
	return { id, provider_model_slug: upstream, capabilities: ["chat.completions"], context_length: 200_000,
		pricing: [{ meter_key: "input_text_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: 1_000_000, price_nanos: price, display_label: "Input", display_unit: "1M tokens" }] };
}

describe("EmpirioLabs legacy serving offers", () => {
	it.each([
		["moonshotai/kimi-k2.7-code", "highspeed"],
		["minimax/minimax-m2.7", "highspeed"],
		["xiaomi/mimo-v2.6-pro", "ultraspeed"],
	])("imports %s as standard and fast with exact upstream IDs and rates", (base, suffix) => {
		const feed = normalizeProviderCatalog({ data: [model(base, "base-upstream", 123), model(`${base}-${suffix}`, "speed-upstream", 789)] }).allModels;
		const grouped = normalizeEmpirioLabsCatalog(feed);
		const preview = normalizeProviderCatalog(normalizedCatalogDocument(grouped));
		expect(preview.valid).toBe(true);
		expect(preview.allModels).toHaveLength(1);
		expect(preview.allModels[0].serviceTiers?.map((tier) => [tier.serviceTier, tier.providerModelSlug, tier.pricing[0].priceNanos])).toEqual([["standard", "base-upstream", 123], ["fast", "speed-upstream", 789]]);
		expect(feed).toHaveLength(2);
		expect(feed[0].serviceTiers).toBeUndefined();
	});
	it("does not guess that Turbo, Flash or unknown suffixes are serving tiers", () => {
		const feed = normalizeProviderCatalog({ data: [model("bytedance-seed/seed-2.1-turbo", "turbo", 123), model("acme/model-highspeed", "highspeed", 456)] }).allModels;
		expect(normalizeEmpirioLabsCatalog(feed)).toEqual(feed);
	});
	it("treats capability, parameter and modality order as immaterial", () => {
		const base = { ...model("minimax/minimax-m2.7", "base", 123), input_modalities: ["text", "image"], capabilities: [{ id: "responses", parameters: ["tools", "max_tokens"] }, { id: "chat.completions", parameters: [] }] };
		const speed = { ...base, id: "minimax/minimax-m2.7-highspeed", provider_model_slug: "fast", input_modalities: ["image", "text"], capabilities: [{ id: "chat.completions", parameters: [] }, { id: "responses", parameters: ["max_tokens", "tools"] }] };
		expect(normalizeEmpirioLabsCatalog(normalizeProviderCatalog({ data: [base, speed] }).allModels)).toHaveLength(1);
	});
	it("rejects changed capability or limit contracts rather than flattening them", () => {
		const feed = normalizeProviderCatalog({ data: [model("minimax/minimax-m2.7", "base", 123), { ...model("minimax/minimax-m2.7-highspeed", "fast", 456), context_length: 100_000 }] }).allModels;
		expect(() => normalizeEmpirioLabsCatalog(feed)).toThrow("differs in contextLength");
		expect(() => normalizeEmpirioLabsCatalog(feed.slice(1))).toThrow("requires an unambiguous standard offer");
	});
});
