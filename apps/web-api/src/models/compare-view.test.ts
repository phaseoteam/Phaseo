import { describe, expect, it } from "vitest";
import { composeCompareView, parseConfidenceInterval, parseEffort, parseVariant } from "@/models/compare-view";
import type { ComparisonSources } from "@/models/compare";
// Trimmed from production /compare/selection payloads on 21 Oct 2026.
import fixture from "./__fixtures__/compare-view-sources.json";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const sources = fixture as unknown as ComparisonSources;
const view = composeCompareView(["openai/gpt-5", "anthropic/claude-sonnet-4.5", "anthropic/claude-opus-5.5"], sources, NOW);
const model = (id: string) => view.models.find((item) => item.id === id)!;

describe("composeCompareView pricing", () => {
	it("headlines GPT-5 on OpenAI's text rates, not a reseller's $0 image and reasoning meters", () => {
		const gpt = model("openai/gpt-5");
		expect(gpt.pricing?.provider).toEqual({ id: "openai", name: "OpenAI", logoId: "openai", routed: true });
		const standard = gpt.pricing!.tiers.standard;
		expect(standard.find((row) => row.kind === "input")).toMatchObject({ meter: "input_text_tokens", price: 1.25, per: 1_000_000, unit: "token" });
		expect(standard.find((row) => row.kind === "output")).toMatchObject({ price: 10 });
		expect(standard.find((row) => row.kind === "cacheRead")).toMatchObject({ price: 0.125 });
		expect(gpt.pricing!.tiers.batch.find((row) => row.kind === "input")?.price).toBe(0.625);
		expect(gpt.providers.map((provider) => provider.id)).toEqual(["openai"]);
		expect(gpt.providers[0]).toMatchObject({ input: 1.25, output: 10, cacheRead: 0.125, tiers: ["standard", "batch", "flex", "priority"] });
		// The headline route's tier prices are the model's pricing, so they aren't sent twice.
		expect(gpt.providers[0]!.pricing).toBeUndefined();
	});

	it("uses Sonnet 4.5's standard $3 list price, not the $1.50 batch rate", () => {
		const sonnet = model("anthropic/claude-sonnet-4.5");
		expect(sonnet.pricing?.provider.id).toBe("anthropic");
		expect(sonnet.pricing!.tiers.standard.find((row) => row.kind === "input")?.price).toBe(3);
		expect(sonnet.pricing!.tiers.batch.find((row) => row.kind === "input")?.price).toBe(1.5);
		expect(sonnet.pricing!.tiers.standard.filter((row) => row.kind === "cacheWrite5m" || row.kind === "cacheWrite1h").map((row) => row.price)).toEqual([3.75, 6]);
	});

	it("shows request meters per 1K requests", () => {
		const search = model("anthropic/claude-sonnet-4.5").pricing!.tiers.standard.find((row) => row.meter === "native_web_search_requests");
		expect(search).toMatchObject({ kind: "other", price: 10, per: 1_000, unit: "request", conditional: false });
	});

	it("shows character meters per 1K characters and still picks a headline provider", () => {
		const speech = composeCompareView(["eleven-labs/eleven-v3"], {
			models: [{ model_id: "eleven-labs/eleven-v3", name: "Eleven V3", organisation_id: "eleven-labs", organisation: { name: "ElevenLabs" } }],
			providerRows: [{
				provider_api_model_id: "elevenlabs:eleven-labs/eleven-v3",
				provider_id: "elevenlabs",
				api_model_id: "eleven-labs/eleven-v3",
				is_active_gateway: true,
				data_api_providers: { api_provider_name: "ElevenLabs" },
				data_api_provider_model_capabilities: [{ capability_id: "audio.speech", status: "active" }],
			}],
			pricingRows: [{ rule_id: "chars", model_key: "elevenlabs:eleven-labs/eleven-v3:audio.speech", pricing_plan: "standard", meter: "input_characters", unit: "character", unit_size: 1, price_per_unit: 0.0001 }],
			modelPlans: [],
			plans: [],
		}, NOW).models[0];
		expect(speech.pricing?.provider).toEqual({ id: "elevenlabs", name: "ElevenLabs", logoId: "elevenlabs", routed: true });
		expect(speech.pricing!.tiers.standard).toEqual([{ meter: "input_characters", kind: "other", label: null, price: 0.1, per: 1_000, unit: "character", conditional: false, condition: null, conditions: [] }]);
		expect(speech.providers[0]).toMatchObject({ input: null, output: null });
	});

	it("keeps long-context rows as conditional and headlines the base rate", () => {
		const bedrock = composeCompareView(["anthropic/claude-sonnet-4.5"], {
			...sources,
			providerRows: sources.providerRows.filter((row) => row.provider_id === "amazon-bedrock"),
		}, NOW).models[0];
		const conditional = bedrock.pricing!.tiers.standard.filter((row) => row.conditional);
		expect(conditional.length).toBeGreaterThan(0);
		expect(conditional.every((row) => row.condition?.startsWith("input tokens"))).toBe(true);
		expect(bedrock.providers[0].input).toBe(3);
	});
});

describe("composeCompareView providers and limits", () => {
	it("splits current Phaseo routes from other listings and merges same-name providers", () => {
		const sonnet = model("anthropic/claude-sonnet-4.5");
		expect(sonnet.providers.map((provider) => provider.name)).toEqual(["Anthropic", "Amazon Bedrock", "Google Vertex", "Venice"]);
		// Every other route carries its own tier prices.
		expect(sonnet.providers[0]!.pricing).toBeUndefined();
		for (const provider of sonnet.providers.slice(1).filter((entry) => entry.input !== null)) {
			// The base band: the unconditional row, else the first band (some routes price only in context bands).
			const inputs = provider.pricing?.standard?.filter((row) => row.kind === "input") ?? [];
			expect(inputs.length).toBeGreaterThan(0);
			expect((inputs.find((row) => !row.conditional) ?? inputs[0])?.price).toBe(provider.input);
		}
		// anthropic-aws is the separate Claude Platform for AWS product, disabled here, so it is another listing, not a second "Anthropic".
		expect(sonnet.otherListings).toEqual([{ id: "anthropic-aws", name: "Claude Platform for AWS" }, { id: "listing-only", name: "Listing Only" }]);
		const opus = model("anthropic/claude-opus-5.5");
		expect(opus.providers.filter((provider) => provider.name === "Anthropic")).toEqual([expect.objectContaining({ id: "anthropic", input: 4 })]);
		expect(opus.otherListings.map((listing) => listing.name)).toEqual(["Amazon Bedrock"]);
	});

	it("falls back to provider limits when the model has none", () => {
		expect(model("anthropic/claude-opus-5.5")).toMatchObject({
			contextWindow: { tokens: 1_000_000, source: "providers" },
			maxOutput: { tokens: 128_000, source: "providers" },
		});
		expect(model("openai/gpt-5")).toMatchObject({
			contextWindow: { tokens: 400_000, source: "model" },
			maxOutput: { tokens: 128_000, source: "model" },
			knowledgeCutoff: "2024-10-01T00:00:00",
		});
	});

	it("derives features from current routes' parameters", () => {
		expect(model("openai/gpt-5").features).toEqual({ tools: true, structuredOutputs: true, reasoning: true, webSearch: true });
		const unrouted = composeCompareView(["lab/listed"], {
			models: [{ model_id: "lab/listed", name: "Listed", organisation_id: "lab" }],
			providerRows: [{ provider_api_model_id: "x", provider_id: "reseller", api_model_id: "lab/listed", is_active_gateway: false, data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "active", params: ["tools"] }] }],
			pricingRows: [],
			modelPlans: [],
			plans: [],
		}, NOW).models[0];
		expect(unrouted.features).toEqual({ tools: null, structuredOutputs: null, reasoning: null, webSearch: null });
		expect(unrouted.pricing).toBeNull();
		expect(unrouted.otherListings).toEqual([{ id: "reseller", name: "reseller" }]);
	});
});

describe("composeCompareView current routes and prices", () => {
	const route = (providerId: string, overrides: Record<string, unknown> = {}, capability: Record<string, unknown> = {}) => ({
		provider_api_model_id: `${providerId}:lab/model`,
		provider_id: providerId,
		api_model_id: "lab/model",
		is_active_gateway: true,
		data_api_providers: { api_provider_name: providerId.toUpperCase(), status: "active", routing_status: "active" },
		data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "active", ...capability }],
		...overrides,
	});
	const price = (providerId: string, amount: number, overrides: Record<string, unknown> = {}) => ({
		rule_id: `${providerId}-${amount}-${JSON.stringify(overrides)}`,
		provider_model_id: `${providerId}:lab/model`,
		model_key: `${providerId}:lab/model:text.generate`,
		sku_status: "active",
		pricing_plan: "standard",
		meter: "input_text_tokens",
		unit: "token",
		unit_size: 1_000_000,
		price_per_unit: amount,
		...overrides,
	});
	const compose = (providerRows: Array<Record<string, unknown>>, pricingRows: Array<Record<string, unknown>>, metadata?: Record<string, unknown>) => composeCompareView(["lab/model"], {
		models: [{ model_id: "lab/model", name: "Model", organisation_id: "lab", metadata, model_details: [{ detail_name: "input_context_length", detail_value: 100_000 }] }],
		providerRows,
		pricingRows,
		modelPlans: [],
		plans: [],
	}, NOW).models[0];

	it("keeps regional routes apart, named by region, with the parent provider's logo", () => {
		const regional = (providerId: string, offerLabel: string | null, offerScope: string | null) => route(providerId, {
			data_api_providers: { api_provider_name: "Anthropic", provider_family_id: "anthropic", offer_label: offerLabel, offer_scope: offerScope, status: "active", routing_status: "active" },
		});
		const view = compose([regional("anthropic", null, null), regional("anthropic-us", "US", "regional")], [price("anthropic", 5), price("anthropic-us", 5.5)]);
		expect(view.providers.map(({ id, name, logoId }) => ({ id, name, logoId }))).toEqual([
			{ id: "anthropic", name: "Anthropic", logoId: "anthropic" },
			{ id: "anthropic-us", name: "Anthropic (US)", logoId: "anthropic" },
		]);
	});

	it("describes video price conditions as options, not raw parameter paths", () => {
		const video = { meter: "output_video_seconds", unit: "second", unit_size: 1 };
		const view = compose([route("live")], [
			price("live", 0.08, { ...video, match: [{ path: "video_params.resolution", op: "eq", value: "480p" }] }),
			price("live", 0.06, { ...video, match: [{ path: "video_params.mode", op: "ne", value: "v2v" }, { path: "video_params.draft", op: "eq", value: 1 }] }),
			price("live", 0.17, { ...video, match: [{ path: "video_params.draft", op: "eq", value: 0 }] }),
		]);
		expect(view.pricing!.tiers.standard.map((row) => [row.price, row.condition])).toEqual([
			[0.06, "mode: not v2v, draft"],
			[0.08, "resolution: 480p"],
			[0.17, "no draft"],
		]);
	});

	it("sends each condition as data, keeping every value of an \"in\" list", () => {
		const view = compose([route("live")], [
			price("live", 0.06, { meter: "output_video_seconds", unit: "second", unit_size: 1, match: [{ path: "video_params.mode", op: "ne", value: "v2v" }, { path: "video_params.draft", op: "eq", value: 1 }] }),
			price("live", 0.5, { meter: "output_video", unit: "video", unit_size: 1, match: [{ path: "video_params.resolution", op: "in", value: ["480P", "480p", "854x480"] }, { path: "video_params.audio", op: "eq", value: true }] }),
		]);
		expect(view.pricing!.tiers.standard.map((row) => [row.condition, row.conditions])).toEqual([
			["resolution: 480p or 854x480, audio", [{ field: "resolution", op: "in", value: ["480P", "480p", "854x480"] }, { field: "audio", op: "eq", value: true }]],
			["mode: not v2v, draft", [{ field: "mode", op: "ne", value: "v2v" }, { field: "draft", op: "eq", value: 1 }]],
		]);
	});

	it("needs an active provider with routing on and a capability in its window", () => {
		const view = compose([
			route("live"),
			route("paused", { data_api_providers: { api_provider_name: "PAUSED", status: "active", routing_status: "disabled" } }),
			route("external", { data_api_providers: { api_provider_name: "EXTERNAL", status: "external", routing_status: "active" } }),
			route("future", {}, { effective_from: "2026-11-01T00:00:00Z" }),
			route("expired", {}, { effective_to: "2026-10-01T00:00:00Z" }),
		], ["live", "paused", "external", "future", "expired"].map((id) => price(id, 1)));
		expect(view.providers.map((provider) => provider.id)).toEqual(["live"]);
		expect(view.otherListings.map((listing) => listing.id).sort()).toEqual(["expired", "external", "future", "paused"]);
	});

	it("ignores draft, scheduled, expired and variant SKUs when picking the headline price", () => {
		const view = compose([route("live")], [
			price("live", 3),
			price("live", 0.5, { sku_status: "draft" }),
			price("live", 0.6, { effective_from: "2026-11-01T00:00:00Z" }),
			price("live", 0.7, { effective_to: "2026-10-01T00:00:00Z" }),
			price("live", 0.8, { model_key: "live:lab/model-fast:text.generate" }),
		]);
		expect(view.pricing?.tiers.standard.map((row) => row.price)).toEqual([3]);
		expect(view.providers[0].input).toBe(3);
	});

	it("prices a provider from its current route, not a disabled one", () => {
		const view = compose([
			route("live"),
			route("live", { provider_api_model_id: "live:lab/model:old", is_active_gateway: false }),
		], [price("live", 3), price("live", 1, { provider_model_id: "live:lab/model:old" })]);
		expect(view.providers[0].input).toBe(3);
	});

	it("reads canonical metadata limits before legacy details and providers", () => {
		const view = compose([route("live", { context_length: 2_000_000, max_output_tokens: 99_000 })], [], { limits: { context: 1_048_576, output: 65_536 } });
		expect(view.contextWindow).toEqual({ tokens: 1_048_576, source: "model" });
		expect(view.maxOutput).toEqual({ tokens: 65_536, source: "model" });
		const legacy = compose([route("live", { max_output_tokens: 99_000 })], []);
		expect(legacy.contextWindow).toEqual({ tokens: 100_000, source: "model" });
		expect(legacy.maxOutput).toEqual({ tokens: 99_000, source: "providers" });
	});
});

describe("composeCompareView benchmarks", () => {
	it("labels variants, parses effort and confidence intervals, and orders shared benchmarks first", () => {
		const eci = view.benchmarks.find((benchmark) => benchmark.id === "epoch-capabilities-index")!;
		expect(eci).toMatchObject({ source: "epoch", higherIsBetter: true });
		expect(Object.keys(eci.results).sort()).toEqual(["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-4.5", "openai/gpt-5"]);
		expect(eci.results["anthropic/claude-opus-5.5"][0]).toMatchObject({ score: 166.82, variant: null, ci: [163.54, 170.99] });
		expect(view.benchmarks[0].id).toBe("epoch-capabilities-index");

		const aa = view.benchmarks.find((benchmark) => benchmark.id === "aa-intelligence-index-v4")!;
		expect(aa.source).toBe("artificial-analysis");
		expect(aa.results["anthropic/claude-opus-5.5"].map((result) => [result.variant, result.effort])).toEqual([
			["Max", "max"], ["Xhigh", "xhigh"], ["High", "high"], ["Medium", "medium"], ["Low", "low"],
		]);
		expect(aa.results["openai/gpt-5"][0]).toMatchObject({ score: 23, variant: "High", effort: "high" });

		const cost = view.benchmarks.find((benchmark) => benchmark.id === "aa-intelligence-index-cost-v4")!;
		expect(cost.higherIsBetter).toBe(false);
		expect(cost.results["anthropic/claude-opus-5.5"][0].variant).toBe("Low");
	});

	it("parses variant text from each source", () => {
		expect(parseVariant("Claude 4.5 Sonnet (Reasoning); Artificial Analysis ID 9", "artificial-analysis")).toBe("Reasoning");
		expect(parseVariant("With Thinking, Pass @ 1", "lab")).toBe("With Thinking, Pass @ 1");
		expect(parseVariant("Google-reported launch evaluation; source chart: https://example.com", "lab")).toBeNull();
		expect(parseVariant("Epoch AI model GPT-5; 95% CI 1–2", "epoch")).toBeNull();
		expect(parseEffort("High Reasoning Effort + Agent")).toBe("high");
		expect(parseEffort("Xhigh")).toBe("xhigh");
		expect(parseEffort("With Thinking")).toBeNull();
		expect(parseConfidenceInterval("Epoch AI model; 95% CI 145.20–148.40")).toEqual([145.2, 148.4]);
		expect(parseConfidenceInterval("no interval")).toBeNull();
	});
});
