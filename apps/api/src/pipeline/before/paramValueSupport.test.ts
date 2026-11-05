import { describe, expect, it } from "vitest";
import { describeParameterValueIssue, parameterValueIssues } from "./paramValueSupport";
import { validateCapabilities } from "./capabilityValidation";

// As stored for google-vertex:google/veo-3.1 on 2026-11-04.
const VERTEX_VEO = {
	size: { type: "enum", values: ["720p", "1080p", "4k"], aliases: ["resolution"] },
	duration: { max: 8, min: 4, step: 2, type: "number", aliases: ["seconds", "duration_seconds"], values_by_size: { "1080p": [8], "4k": [8] } },
	prompt: { type: "string" },
};
const route = (capabilityParams: Record<string, unknown> | unknown[]) => ({ capabilityParams: capabilityParams as Record<string, any> });

describe("parameterValueIssues", () => {
	it("accepts values in the list or range, under the name or an alias", () => {
		expect(parameterValueIssues(route(VERTEX_VEO), { size: "720p", duration: 4 })).toEqual([]);
		expect(parameterValueIssues(route(VERTEX_VEO), { resolution: "1080P", seconds: "8" })).toEqual([]);
	});

	it("reports values outside the list, the range or the step", () => {
		expect(parameterValueIssues(route(VERTEX_VEO), { size: "480p" })).toEqual([
			{ param: "size", value: "480p", reason: "not_allowed", allowed: ["720p", "1080p", "4k"] },
		]);
		expect(parameterValueIssues(route(VERTEX_VEO), { duration: 10 })[0]).toMatchObject({ reason: "above_max", max: 8 });
		expect(parameterValueIssues(route(VERTEX_VEO), { duration: 5 })[0]).toMatchObject({ reason: "off_step" });
	});

	it("applies rules that depend on other values", () => {
		expect(parameterValueIssues(route(VERTEX_VEO), { size: "4k", duration: 4 })).toEqual([
			{ param: "duration", value: 4, reason: "not_allowed", allowed: [8] },
		]);
		const image = route({
			stream: { type: "boolean", default: false },
			partial_images: { type: "integer", min: 0, max: 3, when: [{ if: { stream: [false] }, supported: false, message: "Requires stream=true." }] },
		});
		const [issue] = parameterValueIssues(image, { partial_images: 2 });
		expect(issue).toMatchObject({ param: "partial_images", reason: "unsupported_here" });
		expect(describeParameterValueIssue(issue!)).toBe("Requires stream=true.");
		expect(parameterValueIssues(image, { partial_images: 2, stream: true })).toEqual([]);
	});

	it("has no opinion on names-only, free-form or missing params", () => {
		expect(parameterValueIssues(route(["size", "duration"]), { size: "8k", duration: 99 })).toEqual([]);
		expect(parameterValueIssues(route({ prompt: { type: "string", max_length: 10 } }), { prompt: "a long prompt" })).toEqual([]);
		expect(parameterValueIssues({ capabilityParams: undefined }, { size: "8k" })).toEqual([]);
		expect(parameterValueIssues(route(VERTEX_VEO), { size: ["720p"] })).toEqual([]);
	});

	it("checks dotted parameter names in nested request objects", () => {
		const text = route({ "reasoning.effort": { supported_values: ["low", "high"] } });
		expect(parameterValueIssues(text, { reasoning: { effort: "high" } })).toEqual([]);
		expect(parameterValueIssues(text, { reasoning: { effort: "max" } })[0]).toMatchObject({ param: "reasoning.effort", reason: "not_allowed" });
	});
});

describe("validateCapabilities with parameter values", () => {
	const run = (body: Record<string, unknown>, providers: Array<{ providerId: string; capabilityParams: Record<string, unknown> }>) =>
		validateCapabilities({
			endpoint: "video.generation" as any,
			rawBody: body,
			body,
			requestId: "req_values",
			workspaceId: "team_test",
			providers: providers.map((provider) => ({ ...provider, maxOutputTokens: null })) as any,
			model: "google/veo-3.1",
		});

	it("keeps only the routes that accept the requested values", () => {
		const result = run({ model: "google/veo-3.1", prompt: "a", size: "4k", duration: 8 }, [
			{ providerId: "google-vertex", capabilityParams: VERTEX_VEO },
			{ providerId: "lite", capabilityParams: { size: { values: ["720p"] } } },
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((provider) => provider.providerId)).toEqual(["google-vertex"]);
			expect(result.paramRoutingDiagnostics.filteringStages.find((stage) => stage.stage === "param_values")?.droppedProviders).toEqual(["lite"]);
		}
	});

	it("keeps every route when none accepts, unless parameters are required", async () => {
		const body = { model: "google/veo-3.1", prompt: "a", size: "8k" };
		const providers = [{ providerId: "google-vertex", capabilityParams: VERTEX_VEO }];
		const lenient = run(body, providers);
		expect(lenient.ok && lenient.providers.map((provider) => provider.providerId)).toEqual(["google-vertex"]);

		const strict = run({ ...body, provider: { require_parameters: true } }, providers);
		expect(strict.ok).toBe(false);
		if (!strict.ok) {
			expect(strict.response.status).toBe(400);
			const payload = await strict.response.json() as any;
			const details = payload.details ?? payload.error?.details;
			expect(details[0]).toMatchObject({
				keyword: "unsupported_param_value",
				path: ["size"],
				params: { provider: "google-vertex", value: "8k", allowed: ["720p", "1080p", "4k"] },
			});
		}
	});

	it("treats a route that stores no values as accepting", () => {
		const result = run({ model: "google/veo-3.1", prompt: "a", size: "4k" }, [
			{ providerId: "google-vertex", capabilityParams: VERTEX_VEO },
			{ providerId: "deepinfra", capabilityParams: {} },
		]);
		expect(result.ok && result.providers.map((provider) => provider.providerId)).toEqual(["google-vertex", "deepinfra"]);
	});
});

describe("providerParamSupportStatus with explicit unsupported markers", () => {
	it("treats false and supported:false as unsupported, and a listed name as supported", async () => {
		const { providerParamSupportStatus } = await import("./paramCapabilities");
		const candidate = (capabilityParams: Record<string, unknown>) => ({ providerId: "google-ai-studio", capabilityParams } as any);
		expect(providerParamSupportStatus(candidate({ seed: { supported: false, notes: "Not forwarded." } }), "seed")).toBe("unsupported");
		expect(providerParamSupportStatus(candidate({ logprobs: false }), "logprobs")).toBe("unsupported");
		expect(providerParamSupportStatus(candidate({ reasoning_effort: { support_level: "unsupported" } }), "reasoning_effort")).toBe("unsupported");
		expect(providerParamSupportStatus(candidate({ seed: true }), "seed")).toBe("supported");
		expect(providerParamSupportStatus(candidate({ seed: { type: "integer" } }), "seed")).toBe("supported");
	});
});
