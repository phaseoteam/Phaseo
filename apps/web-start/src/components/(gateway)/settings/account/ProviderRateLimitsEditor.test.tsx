import { renderToStaticMarkup } from "react-dom/server";
import ProviderRateLimitsEditor, { draftsToLimits, parseLimit, toDrafts } from "./ProviderRateLimitsEditor";
import type { ProviderManagedCatalogModel } from "@/app/(dashboard)/settings/account/providers/actions";
jest.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, string>) => values?.model ? `${key}:${values.model}` : key }));
jest.mock("@/app/(dashboard)/settings/account/providers/actions", () => ({ updateProviderRateLimitsAction: jest.fn() }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const models = [{
	id: "acme/atlas", name: "Atlas", provider_model_slug: "atlas", availability: "ready", pricing: [],
	service_tiers: [{ service_tier: "standard", provider_model_slug: "atlas", pricing: [] }, { service_tier: "fast", provider_model_slug: "atlas-fast", pricing: [] }],
}] as unknown as ProviderManagedCatalogModel[];
const limit = (model: string | null, overrides: Record<string, number | null> = {}) => ({ model, requests_per_minute: null, requests_per_day: null, tokens_per_minute: null, tokens_per_day: null, ...overrides });

describe("provider rate limits editor", () => {
	it("accepts whole positive numbers and treats an empty field as no limit", () => {
		expect(parseLimit("")).toBeNull();
		expect(parseLimit(" 1,000,000 ")).toBe(1_000_000);
		expect(parseLimit("1_000")).toBe(1_000);
		expect(parseLimit("2 500 000")).toBe(2_500_000);
		for (const invalid of ["0", "-5", "1.5", "1,5", "12,34,567", "1,000_000", "1e3", "abc", "9007199254740993"]) expect(parseLimit(invalid)).toBeUndefined();
	});

	it("always offers a provider-wide row and omits it when left empty", () => {
		const drafts = toDrafts([limit("atlas-fast", { tokens_per_minute: 5_000 })]);
		expect(drafts.map((draft) => draft.model)).toEqual([null, "atlas-fast"]);
		expect(draftsToLimits(drafts)).toEqual({ limits: [limit("atlas-fast", { tokens_per_minute: 5_000 })] });
		drafts[0].values.requests_per_minute = "600";
		expect(draftsToLimits(drafts)).toEqual({ limits: [limit(null, { requests_per_minute: 600 }), limit("atlas-fast", { tokens_per_minute: 5_000 })] });
	});

	it("refuses to save an empty model row or an invalid number", () => {
		const drafts = toDrafts([limit("atlas", { requests_per_day: 10 })]);
		drafts[1].values.requests_per_day = "";
		expect(draftsToLimits(drafts)).toEqual({ error: "emptyModel", model: "atlas" });
		drafts[1].values.requests_per_day = "ten";
		expect(draftsToLimits(drafts)).toEqual({ error: "invalidNumber" });
	});

	it("explains that limits rank rather than block, and flags models no longer in the catalog", () => {
		const render = (managementMode: "remote" | "managed") => renderToStaticMarkup(<ProviderRateLimitsEditor
			providerSlug="acme" managementMode={managementMode} models={models} onSaved={() => {}}
			rateLimits={{ version: "2026-10-10T09:00:00Z", limits: [limit(null, { requests_per_minute: 600 }), limit("retired", { requests_per_day: 3 })] }} />);
		const html = render("remote");
		expect(html).toContain("description");
		expect(html).toContain("allModels");
		expect(html).toContain('value="600"');
		expect(html).toContain("retired");
		expect(html).toContain("notInCatalog");
		expect(html).toContain("feedNote");
		expect(render("managed")).not.toContain("feedNote");
	});
});
