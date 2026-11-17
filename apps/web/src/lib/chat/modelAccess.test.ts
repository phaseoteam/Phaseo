import { describe, expect, it } from "vitest";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { applyModelAccess, hiddenModelsMatching, isCatalogueModelBlocked, isProviderAllowed, threadUsesHiddenModel, type ModelAccess } from "./modelAccess";

const access = (overrides: Partial<ModelAccess> = {}): ModelAccess => ({
	workspaceId: "workspace-1",
	workspaceName: "Acme",
	source: "member",
	restricted: true,
	hiddenModelCount: 2,
	limitedModelCount: 1,
	hiddenModels: [{ id: "openai/gpt-x", name: "GPT X" }, { id: "google/gemini-y-pro", name: "Gemini Y Pro" }],
	limitedModels: { "anthropic/claude-z": ["anthropic"] },
	...overrides,
});

const route = (modelId: string, providerId: string, extra: Partial<GatewaySupportedModel> = {}): GatewaySupportedModel => ({
	modelId, selectorModelId: modelId, internalModelId: modelId, providerId, capabilities: ["text.generate"],
	effectiveFrom: null, effectiveTo: null, providerName: providerId, providerFamilyId: null, providerOfferLabel: null,
	providerOfferScope: null, providerPromptTrainingPolicy: null, modelName: modelId, modelStatus: "active",
	organisationId: "test", organisationName: "Test", previousModelId: null, releaseDate: null, announcementDate: null, isAvailable: true,
	...extra,
});

describe("applyModelAccess (Chat's picker)", () => {
	const routes = [
		route("openai/gpt-x", "openai"),
		route("anthropic/claude-z", "anthropic"),
		route("anthropic/claude-z", "bedrock"),
		route("meta/llama", "together"),
	];

	it("drops hidden models and providers the rules turn off, keeping the rest", () => {
		expect(applyModelAccess(routes, access()).map((model) => `${model.modelId}@${model.providerId}`))
			.toEqual(["anthropic/claude-z@anthropic", "meta/llama@together"]);
	});

	it("matches a hidden model by any id a route carries", () => {
		const aliased = route("gpt-x-latest", "openai", { selectorModelId: "gpt-x-latest", internalModelId: "openai/gpt-x" });
		expect(applyModelAccess([aliased], access())).toEqual([]);
	});

	it("removes nothing without an answer, or when nothing is restricted", () => {
		expect(applyModelAccess(routes, null)).toBe(routes);
		expect(applyModelAccess(routes, access({ restricted: false }))).toBe(routes);
	});

	it("keeps the workspace's internal models, which the gateway lists differently", () => {
		const internal = route("openai/gpt-x", "internal", { isInternal: true });
		expect(applyModelAccess([internal], access())).toEqual([internal]);
	});
});

describe("isProviderAllowed", () => {
	it("allows every provider for models the rules don't limit", () => {
		expect(isProviderAllowed(access(), ["meta/llama"], "together")).toBe(true);
		expect(isProviderAllowed(access(), ["anthropic/claude-z"], "bedrock")).toBe(false);
		expect(isProviderAllowed(null, ["anthropic/claude-z"], "bedrock")).toBe(true);
	});
});

describe("hiddenModelsMatching (why a search finds nothing)", () => {
	it("matches every word against the id or name", () => {
		expect(hiddenModelsMatching(access(), "gemini pro").map((model) => model.id)).toEqual(["google/gemini-y-pro"]);
		expect(hiddenModelsMatching(access(), "GPT-X").map((model) => model.id)).toEqual(["openai/gpt-x"]);
		expect(hiddenModelsMatching(access(), "claude")).toEqual([]);
	});

	it("matches nothing for an empty search or unrestricted access", () => {
		expect(hiddenModelsMatching(access(), "  ")).toEqual([]);
		expect(hiddenModelsMatching(access({ restricted: false }), "gpt")).toEqual([]);
	});
});

describe("isCatalogueModelBlocked (/models)", () => {
	it("blocks by the model's own id, or when every API id it's listed under is hidden", () => {
		expect(isCatalogueModelBlocked(access(), { model_id: "openai/gpt-x" })).toBe(true);
		expect(isCatalogueModelBlocked(access(), { model_id: "gpt-x-family", gateway_api_model_ids: ["openai/gpt-x"] })).toBe(true);
		expect(isCatalogueModelBlocked(access(), { model_id: "mixed", gateway_api_model_ids: ["openai/gpt-x", "meta/llama"] })).toBe(false);
	});

	it("doesn't blame the rules for models the gateway doesn't list, or when nothing is hidden", () => {
		expect(isCatalogueModelBlocked(access(), { model_id: "catalogue-only", gateway_api_model_ids: [] })).toBe(false);
		expect(isCatalogueModelBlocked(access({ restricted: false }), { model_id: "openai/gpt-x" })).toBe(false);
		expect(isCatalogueModelBlocked(null, { model_id: "openai/gpt-x" })).toBe(false);
	});
});

describe("threadUsesHiddenModel (saved chats aren't moved off hidden models)", () => {
	const thread = (modelId: string, providerId: string | null = null, compareModelIds: string[] = []) => ({ modelId, settings: { providerId, compareModelIds } });
	it("flags a chat whose primary or compare model is hidden, or whose provider is turned off", () => {
		expect(threadUsesHiddenModel(access(), thread("openai/gpt-x"))).toBe(true);
		expect(threadUsesHiddenModel(access(), thread("meta/llama", null, ["google/gemini-y-pro"]))).toBe(true);
		expect(threadUsesHiddenModel(access(), thread("anthropic/claude-z", "bedrock"))).toBe(true);
	});
	it("leaves other chats to the usual availability check", () => {
		expect(threadUsesHiddenModel(access(), thread("anthropic/claude-z", "anthropic"))).toBe(false);
		expect(threadUsesHiddenModel(access(), thread("meta/llama"))).toBe(false);
		expect(threadUsesHiddenModel(null, thread("openai/gpt-x"))).toBe(false);
	});
});
