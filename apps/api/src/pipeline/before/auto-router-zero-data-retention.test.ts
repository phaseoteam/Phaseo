import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as runtime from "@/runtime/env";
import { __resetTieredCacheForTests } from "@/core/tiered-cache";
import { requestDataLimits, withRequestDataLimits } from "../requestRouting";
import {
	AUTO_ROUTER_RESIDENCY_REJECTION,
	autoRouterNeedsZeroDataRetention,
	autoRouterUnmetResidency,
	buildAutoRouterClassifierRequestBody,
	loadManagedAutoRouterCandidates,
	providersMeetingResidency,
	routeOffersZeroDataRetention,
	unmetResidencyKeys,
	workspaceAutoRouterConfigFromRow,
} from "./auto-router";

beforeEach(() => __resetTieredCacheForTests());
afterEach(() => vi.restoreAllMocks());

const FUTURE = "2999-01-01T00:00:00.000Z";
const PAST = "2001-01-01T00:00:00.000Z";

/** Catalogue rows by table: three models, each on one route. */
const TABLES: Record<string, unknown[]> = {
	v2_model_provider_routes: [
		{ provider_model_id: "zdr-co:model/kept", model_slug: "model/kept", provider_slug: "zdr-co", routing_enabled: true, status: "active", effective_from: null, effective_to: null },
		{ provider_model_id: "plain-co:model/logged", model_slug: "model/logged", provider_slug: "plain-co", routing_enabled: true, status: "active", effective_from: null, effective_to: null },
		{ provider_model_id: "plain-co:model/declared", model_slug: "model/declared", provider_slug: "plain-co", routing_enabled: true, status: "active", effective_from: null, effective_to: null },
	],
	v2_route_capabilities: [
		{ provider_model_id: "zdr-co:model/kept", capability_id: "text.generate", status: "active" },
		{ provider_model_id: "plain-co:model/logged", capability_id: "text.generate", status: "active" },
		{ provider_model_id: "plain-co:model/declared", capability_id: "text.generate", status: "active" },
	],
	v2_effective_route_capabilities: [
		{ provider_model_id: "zdr-co:model/kept", capability_id: "text.generate", params: {}, status: "active" },
		{ provider_model_id: "plain-co:model/logged", capability_id: "text.generate", params: {}, status: "active" },
		{ provider_model_id: "plain-co:model/declared", capability_id: "text.generate", params: { data_policy: { zeroDataRetention: true } }, status: "active" },
	],
	v2_providers: [
		{ provider_slug: "zdr-co", zero_data_retention: true, data_policy_variant: "standard", default_execution_regions: ["eu"], default_data_regions: ["eu"] },
		{ provider_slug: "plain-co", zero_data_retention: false, data_policy_variant: "standard", default_execution_regions: null, default_data_regions: null },
	],
	v2_pricing_skus: ["zdr-co:model/kept", "plain-co:model/logged", "plain-co:model/declared"].map((id) => ({
		sku_id: `sku:${id}`, provider_model_id: id, service_tier_slug: "standard", status: "active", effective_from: null, effective_to: null,
	})),
	v2_pricing_sku_meters: ["zdr-co:model/kept", "plain-co:model/logged", "plain-co:model/declared"].flatMap((id) => [
		{ sku_id: `sku:${id}`, meter_key: "input_text_tokens", unit_quantity: 1_000_000, price_nanos: 100_000_000 },
		{ sku_id: `sku:${id}`, meter_key: "output_text_tokens", unit_quantity: 1_000_000, price_nanos: 400_000_000 },
	]),
	v2_benchmark_results: [],
};

function mockCatalogue(tables: Record<string, unknown[]> = TABLES) {
	const client = createClient("https://catalogue.example.test", "test-service-role", {
		auth: { persistSession: false },
		global: { fetch: async (input) => {
			const table = new URL(String(input)).pathname.split("/").pop() ?? "";
			return new Response(JSON.stringify(tables[table] ?? []), { headers: { "Content-Type": "application/json" } });
		} },
	});
	vi.spyOn(runtime, "getSupabaseAdmin").mockReturnValue(client);
}

const unrestricted = workspaceAutoRouterConfigFromRow({ auto_routing_spend_profile: "unrestricted" });

/** A route's text capability policy, routable and in effect unless `overrides` say otherwise. */
function policy(capability_id: string, data_policy: unknown, overrides: Partial<{ status: string; effective_from: string | null; effective_to: string | null }> = {}) {
	return { capability_id, has_params: data_policy !== null, data_policy, status: "active", effective_from: null, effective_to: null, ...overrides };
}

describe("auto router and zero data retention", () => {
	it("shortlists only models with a route that keeps no data when the request needs it", async () => {
		mockCatalogue();
		const body = { model: "phaseo/auto", input: "hello" };
		const all = await loadManagedAutoRouterCandidates(unrestricted, body, undefined, { endpoint: "responses", residency: {} });
		expect([...all.models].sort()).toEqual(["model/declared", "model/kept", "model/logged"]);
		expect(all.droppedForResidency).toBe(0);

		const zdr = await loadManagedAutoRouterCandidates(unrestricted, body, undefined, { endpoint: "responses", residency: { requireZeroDataRetention: true } });
		expect([...zdr.models].sort()).toEqual(["model/declared", "model/kept"]);
		expect(zdr.totalEligible).toBe(2);
		expect(zdr.droppedForResidency).toBe(1);
		expect(zdr.unmetByDropped).toEqual(["zero_data_retention"]);

		// Regions too, from the provider's own columns or, when they're empty, its defaults.
		const eu = await loadManagedAutoRouterCandidates(unrestricted, body, undefined, { endpoint: "responses", residency: { requiredDataRegion: "eu" } });
		expect(eu.models).toEqual(["model/kept"]);
		expect(eu.droppedForResidency).toBe(2);
		expect(eu.unmetByDropped).toEqual(["data_region"]);
	});

	it("leaves out providers the request or workspace excludes before cutting the shortlist to its size", async () => {
		// Thirteen equally priced models that keep no data: twelve served only by an excluded provider, the last by the one allowed.
		const models = Array.from({ length: 13 }, (_, index) => ({ model: `model/m${String(index).padStart(2, "0")}`, provider: index < 12 ? "excluded-co" : "allowed-co" }));
		const ids = models.map(({ model, provider }) => `${provider}:${model}`);
		mockCatalogue({
			v2_model_provider_routes: models.map(({ model, provider }, index) => ({ provider_model_id: ids[index], model_slug: model, provider_slug: provider, routing_enabled: true, status: "active", effective_from: null, effective_to: null })),
			v2_route_capabilities: ids.map((id) => ({ provider_model_id: id, capability_id: "text.generate", status: "active" })),
			v2_effective_route_capabilities: ids.map((id) => ({ provider_model_id: id, capability_id: "text.generate", params: {}, status: "active" })),
			v2_providers: ["excluded-co", "allowed-co"].map((slug) => ({ provider_slug: slug, zero_data_retention: true, data_policy_variant: "standard", default_execution_regions: null, default_data_regions: null })),
			v2_pricing_skus: ids.map((id) => ({ sku_id: `sku:${id}`, provider_model_id: id, service_tier_slug: "standard", status: "active", effective_from: null, effective_to: null })),
			v2_pricing_sku_meters: ids.flatMap((id) => [
				{ sku_id: `sku:${id}`, meter_key: "input_text_tokens", unit_quantity: 1_000_000, price_nanos: 100_000_000 },
				{ sku_id: `sku:${id}`, meter_key: "output_text_tokens", unit_quantity: 1_000_000, price_nanos: 400_000_000 },
			]),
			v2_benchmark_results: [],
		});
		const body = { model: "phaseo/auto", input: "hello", provider: { require_zero_data_retention: true } };
		const unfiltered = await loadManagedAutoRouterCandidates(unrestricted, body, undefined, { endpoint: "responses", residency: { requireZeroDataRetention: true } });
		expect(unfiltered.models).toHaveLength(12);
		expect(unfiltered.models).not.toContain("model/m12");
		for (const allowed of [
			(provider: string) => provider !== "excluded-co",
			(provider: string) => provider === "allowed-co",
		]) {
			const filtered = await loadManagedAutoRouterCandidates(unrestricted, body, undefined, { endpoint: "responses", residency: { requireZeroDataRetention: true }, providerAllowed: allowed });
			expect(filtered.models).toEqual(["model/m12"]);
		}
	});

	it("reads a route's zero data retention the way the gateway context does", () => {
		const zdrProvider = { provider_slug: "zdr-co", zero_data_retention: true, data_policy_variant: "standard" as const, execution_regions: null, data_regions: null };
		const plainProvider = { provider_slug: "plain-co", zero_data_retention: false, data_policy_variant: "standard" as const, execution_regions: null, data_regions: null };
		// The provider's own setting, when no capability declares one.
		expect(routeOffersZeroDataRetention({ data_policies: [] }, zdrProvider, "responses", "model/a")).toBe(true);
		expect(routeOffersZeroDataRetention({ data_policies: [] }, plainProvider, "responses", "model/a")).toBe(false);
		expect(routeOffersZeroDataRetention({ data_policies: [] }, undefined, "responses", "model/a")).toBe(false);
		// A capability's declaration wins over the provider's, both ways.
		expect(routeOffersZeroDataRetention({
			data_policies: [policy("text.generate", { zdrEligibility: "ineligible" })],
		}, zdrProvider, "responses", "model/a")).toBe(false);
		expect(routeOffersZeroDataRetention({
			data_policies: [policy("text.generate", { zeroDataRetention: true })],
		}, plainProvider, "responses", "model/a")).toBe(true);
		// An empty text.generate defers to the endpoint's own capability.
		expect(routeOffersZeroDataRetention({
			data_policies: [policy("text.generate", null), policy("responses", { zeroDataRetention: true })],
		}, plainProvider, "responses", "model/a")).toBe(true);
		// A catalogue guarantee past its deadline no longer counts.
		expect(routeOffersZeroDataRetention({
			data_policies: [policy("text.generate", { zeroDataRetention: true, catalogManaged: true, validUntil: PAST })],
		}, plainProvider, "responses", "model/a")).toBe(false);
		expect(routeOffersZeroDataRetention({
			data_policies: [policy("text.generate", { zeroDataRetention: true, catalogManaged: true, validUntil: FUTURE })],
		}, plainProvider, "responses", "model/a")).toBe(true);
		// Capabilities the context wouldn't read don't count: not routable, or not in effect.
		for (const unread of [{ status: "disabled" }, { status: "internal_testing" }, { effective_to: PAST }, { effective_from: FUTURE }]) {
			expect(routeOffersZeroDataRetention({
				data_policies: [policy("text.generate", { zdrEligibility: "ineligible" }, unread), policy("responses", { zeroDataRetention: true })],
			}, plainProvider, "responses", "model/a")).toBe(true);
			expect(routeOffersZeroDataRetention({
				data_policies: [policy("text.generate", { zeroDataRetention: true }, unread)],
			}, plainProvider, "responses", "model/a")).toBe(false);
		}
		// Only text.generate and the request's own surface are read, as the context loads them.
		expect(routeOffersZeroDataRetention({
			data_policies: [policy("text.generate", null), policy("chat.completions", { zeroDataRetention: true })],
		}, plainProvider, "responses", "model/a")).toBe(false);
		expect(routeOffersZeroDataRetention({
			data_policies: [policy("text.generate", null), policy("chat.completions", { zeroDataRetention: true })],
		}, plainProvider, "chat.completions", "model/a")).toBe(true);
		// A deranked capability is still routable.
		expect(routeOffersZeroDataRetention({
			data_policies: [policy("text.generate", { zeroDataRetention: true }, { status: "deranked_lvl2" })],
		}, plainProvider, "responses", "model/a")).toBe(true);
	});

	it("keeps only the providers that meet the request's residency requirements", () => {
		const providers = [
			{ providerId: "zdr-eu", residencyMode: "provider_managed" as const, executionRegions: ["eu"], dataRegions: ["eu"], zeroDataRetention: true },
			{ providerId: "zdr-us", residencyMode: "provider_managed" as const, executionRegions: ["us"], dataRegions: ["us"], zeroDataRetention: true },
			{ providerId: "logged", residencyMode: "unknown" as const, executionRegions: null, dataRegions: null, zeroDataRetention: false },
		];
		const ids = (requirement: Parameters<typeof providersMeetingResidency>[1]) => providersMeetingResidency(providers, requirement).map((provider) => provider.providerId);
		expect(ids({})).toEqual(["zdr-eu", "zdr-us", "logged"]);
		expect(ids({ requireZeroDataRetention: true })).toEqual(["zdr-eu", "zdr-us"]);
		expect(ids({ requireZeroDataRetention: true, requiredDataRegion: "eu" })).toEqual(["zdr-eu"]);
		expect(ids({ requiredExecutionRegion: "ap" })).toEqual([]);
	});

	it("needs zero data retention for the request's flag, or the workspace or key's policy", () => {
		expect(autoRouterNeedsZeroDataRetention({ provider: { require_zero_data_retention: true } }, null)).toBe(true);
		expect(autoRouterNeedsZeroDataRetention({ routing: { zdr: true } }, { privacyZdrOnly: false })).toBe(true);
		expect(autoRouterNeedsZeroDataRetention({}, { privacyZdrOnly: true })).toBe(true);
		expect(autoRouterNeedsZeroDataRetention({ provider: { require_zero_data_retention: false } }, { privacyZdrOnly: false })).toBe(false);
	});

	it("sends the classifier request with the same limits on where the data may go", () => {
		expect(requestDataLimits({ input: "hello" })).toBeNull();
		const body = {
			input: "Summarize these Slack messages",
			provider: { require_zero_data_retention: true, only: ["zdr-co"], ignore: ["plain-co"], sort: "price" },
			routing: { required_data_region: "eu" },
		};
		const request = buildAutoRouterClassifierRequestBody(body, "responses") as any;
		expect(request.provider).toEqual({
			require_zero_data_retention: true,
			required_data_region: "eu",
			only: ["zdr-co"],
			ignore: ["plain-co"],
		});
		// Preferences that don't limit where data goes stay with the request itself.
		expect(request.provider.sort).toBeUndefined();
		expect(buildAutoRouterClassifierRequestBody({ input: "hello" }, "responses")).not.toHaveProperty("provider");
		// Request classifiers' bodies get them too, over any of their own.
		expect(withRequestDataLimits({ model: "acme/classifier", provider: { sort: "price", only: ["anyone"] } }, requestDataLimits(body))).toEqual({
			model: "acme/classifier",
			provider: { sort: "price", only: ["zdr-co"], ignore: ["plain-co"], require_zero_data_retention: true, required_data_region: "eu" },
		});
		expect(withRequestDataLimits({ model: "acme/classifier" }, null)).toEqual({ model: "acme/classifier" });
	});

	it("names only the requirements no provider met", () => {
		const eu = { residencyMode: "provider_managed" as const, executionRegions: ["eu"], dataRegions: ["eu"], zeroDataRetention: false };
		const zdrUs = { residencyMode: "provider_managed" as const, executionRegions: ["us"], dataRegions: ["us"], zeroDataRetention: true };
		expect(unmetResidencyKeys([eu], { requiredDataRegion: "eu", requireZeroDataRetention: true })).toEqual(["zero_data_retention"]);
		expect(unmetResidencyKeys([zdrUs], { requiredDataRegion: "eu", requireZeroDataRetention: true })).toEqual(["data_region"]);
		// Each met by some provider, but not by one together: both.
		expect(unmetResidencyKeys([eu, zdrUs], { requiredDataRegion: "eu", requireZeroDataRetention: true })).toEqual(["data_region", "zero_data_retention"]);
		expect(unmetResidencyKeys([eu], {})).toEqual([]);
	});

	it("explains a failure by residency only when residency left every candidate out", () => {
		const requirement = { requiredDataRegion: "eu", requireZeroDataRetention: true };
		const residency = (unmet: Array<"execution_region" | "data_region" | "zero_data_retention">) => ({ reason: AUTO_ROUTER_RESIDENCY_REJECTION, unmet });
		expect(autoRouterUnmetResidency({ requirement, rejected: [residency(["zero_data_retention"]), residency(["zero_data_retention"])], droppedForResidency: 0, unmetByDropped: [] })).toEqual({
			unmet: { zero_data_retention: true },
			description: "No model Auto can choose has a provider that offers zero data retention.",
		});
		// What the shortlist left out counts too.
		expect(autoRouterUnmetResidency({ requirement, rejected: [residency(["zero_data_retention"])], droppedForResidency: 3, unmetByDropped: ["data_region"] })).toEqual({
			unmet: { data_region: "eu", zero_data_retention: true },
			description: "No model Auto can choose has a provider that meets this request's residency requirements: one that stores data in the EU region, one that offers zero data retention.",
		});
		// No compliant model to shortlist at all.
		expect(autoRouterUnmetResidency({ requirement: { requireZeroDataRetention: true }, rejected: [], droppedForResidency: 4, unmetByDropped: ["zero_data_retention"] })?.unmet)
			.toEqual({ zero_data_retention: true });
		// Other reasons too: not residency's doing alone.
		expect(autoRouterUnmetResidency({ requirement, rejected: [residency(["zero_data_retention"]), { reason: "request_capabilities_unsupported" }], droppedForResidency: 0, unmetByDropped: [] })).toBeNull();
		expect(autoRouterUnmetResidency({ requirement: {}, rejected: [], droppedForResidency: 0, unmetByDropped: [] })).toBeNull();
	});
});
