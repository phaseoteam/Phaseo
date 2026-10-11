import { describe, expect, it } from "vitest";
import { normalizeProviderCatalog } from "./provider-catalog";
import { normalizedCatalogDocument, type CatalogOverrides } from "./provider-catalog-overrides";
import { applyEmpirioLabsCatalogOverrides, normalizeEmpirioLabsCatalog } from "./provider-catalog-empiriolabs";

function model(id: string, upstream: string, price: number) {
	return { id, provider_model_slug: upstream, capabilities: ["chat.completions"], context_length: 200_000,
		pricing: [{ meter_key: "input_text_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: 1_000_000, price_nanos: price, display_label: "Input", display_unit: "1M tokens" }] };
}

describe("EmpirioLabs legacy serving offers", () => {
	const edit = (value: unknown) => ({ value, actor_id: "operator", actor_kind: "phaseo" as const, edited_at: "2026-10-10T00:00:00Z" });
	const feed = () => normalizeProviderCatalog({ data: [model("minimax/minimax-m2.7", "base", 123), model("minimax/minimax-m2.7-highspeed", "speed", 456)] }).allModels;
	it("preserves legacy speed-ID availability and price overrides across upstream refreshes", () => {
		const overrides: CatalogOverrides = { "minimax/minimax-m2.7-highspeed": {
			availability: edit("not_ready"), "/pricing/input_text_tokens/$rate": edit({ priceNanos: 789, unitQuantity: 1_000_000, unit: "token", displayUnit: "1M tokens" }),
		} };
		for (const source of [feed(), feed()]) {
			source[1].pricing[0].priceNanos = 999;
			const grouped = applyEmpirioLabsCatalogOverrides(source, overrides);
			expect(grouped[0].serviceTiers?.[1]).toMatchObject({ availability: "not_ready", pricing: [{ priceNanos: 789 }] });
			expect(source).toHaveLength(2);
			expect(source[1].pricing[0].priceNanos).toBe(999);
		}
	});
	it("also preserves new base-model fast-tier edits without resurrecting the standalone ID", () => {
		const overrides: CatalogOverrides = { "minimax/minimax-m2.7": { "/serviceTiers/fast/availability": edit("not_ready"), "/serviceTiers/fast/pricing/input_text_tokens/priceNanos": edit(789) } };
		const grouped = applyEmpirioLabsCatalogOverrides(feed(), overrides);
		expect(grouped).toHaveLength(1);
		expect(grouped[0].serviceTiers?.[1]).toMatchObject({ availability: "not_ready", pricing: [{ priceNanos: 789 }] });
	});
	it("honors removal of a legacy speed offer and follows upstream prices when edits are reverted", () => {
		const removed = applyEmpirioLabsCatalogOverrides(feed(), { "minimax/minimax-m2.7-highspeed": { $removed: edit(true) } });
		expect(removed).toHaveLength(1);
		expect(removed[0].serviceTiers).toBeUndefined();
		expect(applyEmpirioLabsCatalogOverrides(feed(), {})[0].serviceTiers?.[1].pricing[0].priceNanos).toBe(456);
	});
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
