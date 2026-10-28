import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as runtime from "@/runtime/env";
import { __resetTieredCacheForTests } from "@/core/tiered-cache";
import {
	AUTO_ROUTER_RESIDENCY_REJECTION,
	autoRouterClassifierDataLimits,
	autoRouterNeedsZeroDataRetention,
	autoRouterUnmetResidency,
	buildAutoRouterClassifierRequestBody,
	loadManagedAutoRouterCandidates,
	providersMeetingResidency,
	routeOffersZeroDataRetention,
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
		{ provider_slug: "zdr-co", zero_data_retention: true, data_policy_variant: "standard" },
		{ provider_slug: "plain-co", zero_data_retention: false, data_policy_variant: "standard" },
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

function mockCatalogue() {
	const client = createClient("https://catalogue.example.test", "test-service-role", {
		auth: { persistSession: false },
		global: { fetch: async (input) => {
			const table = new URL(String(input)).pathname.split("/").pop() ?? "";
			return new Response(JSON.stringify(TABLES[table] ?? []), { headers: { "Content-Type": "application/json" } });
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
		const all = await loadManagedAutoRouterCandidates(unrestricted, body, undefined, { endpoint: "responses", zeroDataRetention: false });
		expect([...all.models].sort()).toEqual(["model/declared", "model/kept", "model/logged"]);
		expect(all.droppedForZeroDataRetention).toBe(0);

		const zdr = await loadManagedAutoRouterCandidates(unrestricted, body, undefined, { endpoint: "responses", zeroDataRetention: true });
		expect([...zdr.models].sort()).toEqual(["model/declared", "model/kept"]);
		expect(zdr.totalEligible).toBe(2);
		expect(zdr.droppedForZeroDataRetention).toBe(1);
	});

	it("reads a route's zero data retention the way the gateway context does", () => {
		const zdrProvider = { provider_slug: "zdr-co", zero_data_retention: true, data_policy_variant: "standard" as const };
		const plainProvider = { provider_slug: "plain-co", zero_data_retention: false, data_policy_variant: "standard" as const };
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
		expect(autoRouterClassifierDataLimits({ input: "hello" })).toBeNull();
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
	});

	it("explains a failure by residency only when residency left every candidate out", () => {
		const requirement = { requireZeroDataRetention: true };
		expect(autoRouterUnmetResidency({
			requirement,
			zeroDataRetention: true,
			rejectedReasons: [AUTO_ROUTER_RESIDENCY_REJECTION, AUTO_ROUTER_RESIDENCY_REJECTION],
			droppedForZeroDataRetention: 0,
		})).toEqual({
			unmet: { zero_data_retention: true },
			description: "No model Auto can choose has a provider that offers zero data retention.",
		});
		// No zero-retention model to shortlist at all.
		expect(autoRouterUnmetResidency({ requirement: {}, zeroDataRetention: true, rejectedReasons: [], droppedForZeroDataRetention: 4 })?.unmet)
			.toEqual({ zero_data_retention: true });
		// Other reasons too: not residency's doing alone.
		expect(autoRouterUnmetResidency({
			requirement,
			zeroDataRetention: true,
			rejectedReasons: [AUTO_ROUTER_RESIDENCY_REJECTION, "request_capabilities_unsupported"],
			droppedForZeroDataRetention: 0,
		})).toBeNull();
		expect(autoRouterUnmetResidency({ requirement: {}, zeroDataRetention: false, rejectedReasons: [], droppedForZeroDataRetention: 0 })).toBeNull();
		expect(autoRouterUnmetResidency({
			requirement: { requiredExecutionRegion: "eu", requireZeroDataRetention: true },
			zeroDataRetention: true,
			rejectedReasons: [AUTO_ROUTER_RESIDENCY_REJECTION],
			droppedForZeroDataRetention: 0,
		})?.description).toBe("No model Auto can choose has a provider that meets this request's residency requirements: one that processes requests in the EU region, one that offers zero data retention.");
	});
});
