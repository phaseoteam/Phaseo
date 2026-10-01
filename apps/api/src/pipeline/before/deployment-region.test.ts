import { describe, expect, it } from "vitest";
import { getEffectiveRoutingHints } from "../requestRouting";
import {
	applyDeploymentRegionPolicy,
	normalizeGatewayRoutingRegion,
	validateRegionalTextRequest,
} from "./deployment-region";

describe("deployment region policy", () => {
	it("normalizes supported deployment regions", () => {
		expect(normalizeGatewayRoutingRegion(" EU ")).toBe("eu");
		expect(normalizeGatewayRoutingRegion("us")).toBe("us");
		expect(normalizeGatewayRoutingRegion("global")).toBeNull();
	});

	it("leaves global deployments unchanged", () => {
		const body = { model: "openai/gpt-5" };
		expect(applyDeploymentRegionPolicy(body, undefined)).toEqual({
			ok: true,
			body,
			region: null,
		});
		expect(validateRegionalTextRequest("chat.completions", {
			web_search_options: { search_context_size: "high" },
		}, undefined)).toBeNull();
	});

	it("injects immutable execution and data requirements", () => {
		const result = applyDeploymentRegionPolicy(
			{
				model: "openai/gpt-5",
				provider: { order: ["openai-eu"] },
			},
			"eu",
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const hints = getEffectiveRoutingHints(result.body);
		expect(hints.requiredExecutionRegion).toBe("eu");
		expect(hints.requiredDataRegion).toBe("eu");
		expect(hints.merged.order).toEqual(["openai-eu"]);
		expect(result.body.modalities).toEqual(["text"]);
	});

	it("accepts an equivalent request constraint", () => {
		const result = applyDeploymentRegionPolicy(
			{
				routing: {
					required_execution_region: "EU",
					required_data_region: "eu",
				},
			},
			"eu",
		);
		expect(result.ok).toBe(true);
	});

	it("rejects a conflicting execution region", () => {
		expect(
			applyDeploymentRegionPolicy(
				{ provider: { required_execution_region: "us" } },
				"eu",
			),
		).toEqual({
			ok: false,
			region: "eu",
			field: "required_execution_region",
			requestedRegion: "us",
		});
	});

	it("rejects a conflicting data region introduced by routing defaults", () => {
		expect(
			applyDeploymentRegionPolicy(
				{ routing: { required_data_region: "eu" } },
				"us",
			),
		).toEqual({
			ok: false,
			region: "us",
			field: "required_data_region",
			requestedRegion: "eu",
		});
	});

	it("allows text requests and function tools on regional text endpoints", () => {
		expect(validateRegionalTextRequest("responses", {
			input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
			tools: [{ type: "function", name: "weather" }],
		}, "eu")).toBeNull();
	});

	it("rejects hosted search options in both public spellings on every regional text endpoint", () => {
		for (const endpoint of ["chat.completions", "responses", "messages"] as const) {
			for (const key of ["web_search_options", "webSearchOptions"] as const) {
				expect(validateRegionalTextRequest(endpoint, {
					[key]: { search_context_size: "high" },
				}, "eu")).toMatchObject({
					reason: "hosted_tool_not_supported",
					path: [key],
				});
			}
		}
	});

	it("rejects non-text endpoints, content, outputs, and hosted tools", () => {
		expect(validateRegionalTextRequest("images.generations", {}, "eu")?.reason)
			.toBe("endpoint_not_supported");
		expect(validateRegionalTextRequest("chat.completions", {
			messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }] }],
		}, "eu")?.reason).toBe("non_text_content");
		expect(validateRegionalTextRequest("responses", { modalities: ["text", "audio"] }, "us")?.reason)
			.toBe("non_text_output");
		expect(validateRegionalTextRequest("messages", { tools: [{ type: "web_search_20250305" }] }, "eu")?.reason)
			.toBe("hosted_tool_not_supported");
	});
});
