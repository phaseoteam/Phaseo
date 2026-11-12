import { describe, expect, it } from "vitest";
import {
	applyDynamicRouteToBody,
	evaluateDynamicRoute,
	normalizeDynamicRouteConfig,
	selectDynamicRouteContextModels,
	suppressDynamicRouteModelOverrides,
} from "./dynamic-routes";

const policy = {
	id: "route-1",
	name: "Production support",
	version: 3,
	config: {
		cacheAwareRouting: true,
		sessionAffinity: true,
		defaultAction: {
			routingMode: "balanced" as const,
			providerOrder: ["openai", "anthropic"],
		},
		rules: [{
			id: "eu",
			name: "EU traffic",
			enabled: true,
			condition: {
				field: "metadata" as const,
				operator: "equals" as const,
				metadataKey: "region",
				value: "eu",
			},
			action: {
				routingMode: "latency" as const,
				modelFallbacks: ["openai/gpt-5-mini", "google/gemini-2.5-flash"],
				providerOnly: ["openai-eu", "azure-eu"],
				allowFallbacks: true,
			},
		}],
	},
};

function headerRoute(name: string, value: string, operator: string) {
	return { ...policy, config: { schemaVersion: 2, entryNodeId: "condition", nodes: [
		{ id: "condition", type: "condition", data: { source: "header", path: name, operator, value } },
		{ id: "matched", type: "model", data: { model: "matched" } },
		{ id: "safe", type: "model", data: { model: "safe" } },
	], edges: [
		{ id: "yes", source: "condition", target: "matched", sourceHandle: "true" },
		{ id: "no", source: "condition", target: "safe", sourceHandle: "false" },
	] } };
}

describe("dynamic route evaluation", () => {
	it.each(["Authorization", "cookie", "x-phaseo-mcp-secret", "x-control-secret", "cf-access-jwt-assertion", "x-api-key"])(
		"does not expose credential header %s to routing conditions", (name) => {
			const route = headerRoute(name, "secret", "starts_with");
			for (const headers of [new Headers({ [name]: "secret-value", "x-region": "eu" }), { [name]: "secret-value" }]) {
				expect(evaluateDynamicRoute({ policy: route, endpoint: "responses", model: "openai/gpt-5", body: {}, headers }).action.model).toBe("safe");
			}
		});
	it("retains ordinary custom header routing", () => {
		const route = headerRoute("x-region", "eu", "equals");
		expect(evaluateDynamicRoute({ policy: route, endpoint: "responses", model: "openai/gpt-5", body: {}, headers: new Headers({ "x-region": "eu" }) }).action.model).toBe("matched");
	});
	it("selects the first matching rule and enforces its provider pool", () => {
		const evaluated = evaluateDynamicRoute({
			policy,
			endpoint: "responses",
			model: "openai/gpt-5",
			body: { metadata: { region: "EU" } },
		});
		const body = applyDynamicRouteToBody({ metadata: { region: "EU" } }, evaluated);

		expect(evaluated.matchedRuleId).toBe("eu");
		expect(body.provider).toMatchObject({
			only: ["openai-eu", "azure-eu"],
			sort: "latency",
			allow_fallbacks: true,
		});
		expect(body.routing).toMatchObject({
			cache_aware: true,
			session_affinity: true,
			model_fallbacks: ["openai/gpt-5-mini", "google/gemini-2.5-flash"],
		});
	});

	it("uses the default action when no rule matches", () => {
		const evaluated = evaluateDynamicRoute({
			policy,
			endpoint: "chat.completions",
			model: "openai/gpt-5",
			body: { metadata: { region: "us" } },
		});

		expect(evaluated.matchedRuleId).toBeNull();
		expect(evaluated.action.providerOrder).toEqual(["openai", "anthropic"]);
	});

	it("preserves an exact provider-qualified model while retaining other route controls", () => {
		const evaluated = evaluateDynamicRoute({
			policy,
			endpoint: "responses",
			model: "openai/gpt-5",
			body: { metadata: { region: "EU" } },
		});
		const constrained = suppressDynamicRouteModelOverrides(evaluated);
		const body = applyDynamicRouteToBody(
			{ model: "openai/gpt-5", metadata: { region: "EU" } },
			constrained,
		);

		expect(body.model).toBe("openai/gpt-5");
		expect(body.routing?.model_fallbacks).toBeUndefined();
		expect(body.provider).toMatchObject({
			only: ["openai-eu", "azure-eu"],
			sort: "latency",
		});
	});

	it("keeps fallbacks out of the initial context selection", () => {
		expect(selectDynamicRouteContextModels({
			modelFallbacks: ["fallback/one", "fallback/two"],
		})).toEqual([]);
		expect(selectDynamicRouteContextModels({
			model: "primary/model",
			modelFallbacks: ["fallback/model"],
		})).toEqual(["primary/model"]);
	});

	it("selects an explicit fallback only after the pipeline requests it", () => {
		expect(selectDynamicRouteContextModels({
			model: "primary/model",
			modelFallbacks: ["fallback/model"],
		}, "fallback/model")).toEqual(["fallback/model"]);
	});

	it("bounds malformed user configuration", () => {
		const normalized = normalizeDynamicRouteConfig({
			rules: new Array(50).fill(null).map((_, index) => ({
				id: `rule-${index}`,
				condition: { field: "always", operator: "exists" },
				action: { providerOnly: ["openai", "openai", 12] },
			})),
		});

		expect(normalized.rules).toHaveLength(32);
		expect(normalized.rules?.[0]?.action.providerOnly).toEqual(["openai"]);
	});

	it("branches on a nested request-body field and selects a model node", () => {
		const evaluated = evaluateDynamicRoute({
			policy: {
				id: "route-graph",
				name: "Graph route",
				version: 4,
				config: {
					schemaVersion: 2,
					entryNodeId: "start",
					nodes: [
						{ id: "start", type: "start", data: {} },
						{ id: "paid", type: "condition", data: { source: "body", path: "customer.plan", operator: "equals", value: "pro" } },
						{ id: "pro-model", type: "model", data: { model: "anthropic/claude-sonnet-4.5", providerOrder: ["anthropic"] } },
						{ id: "free-model", type: "model", data: { model: "openai/gpt-5-mini", providerOrder: ["openai"] } },
					],
					edges: [
						{ id: "start-paid", source: "start", target: "paid" },
						{ id: "paid-pro", source: "paid", target: "pro-model", sourceHandle: "true" },
						{ id: "paid-free", source: "paid", target: "free-model", sourceHandle: "false" },
					],
				},
			},
			endpoint: "responses",
			model: "dynamic/support",
			body: { customer: { plan: "pro" } },
		});

		expect(evaluated.visitedNodeIds).toEqual(["start", "paid", "pro-model"]);
		expect(evaluated.action.model).toBe("anthropic/claude-sonnet-4.5");
	});

	it("uses the exceeded branch for route budget nodes", () => {
		const evaluated = evaluateDynamicRoute({
			policy: {
				id: "budget-route",
				name: "Budget route",
				version: 1,
				config: {
					schemaVersion: 2,
					entryNodeId: "budget",
					nodes: [
						{ id: "budget", type: "budget_limit", data: { window: "monthly", maxCostUsd: 10 } },
						{ id: "within", type: "model", data: { model: "anthropic/claude-sonnet-4.5" } },
						{ id: "fallback", type: "model", data: { model: "openai/gpt-5-mini" } },
					],
					edges: [
						{ id: "budget-within", source: "budget", target: "within", sourceHandle: "within" },
						{ id: "budget-over", source: "budget", target: "fallback", sourceHandle: "exceeded" },
					],
				},
			},
			endpoint: "responses",
			model: "dynamic/support",
			body: {},
			usage: { ok: true, reason: null, resetAt: null, buckets: { monthly: { windowStart: "2026-07-01", requestsUsed: 1, requestsLimit: 0, costUsedNanos: 11_000_000_000, costLimitNanos: 0 } } },
		});

		expect(evaluated.visitedNodeIds).toEqual(["budget", "fallback"]);
		expect(evaluated.action.model).toBe("openai/gpt-5-mini");
	});
});
