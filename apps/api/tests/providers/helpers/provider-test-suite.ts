// Provider Test Suite Helpers
// Shared utilities for testing providers across all protocols

import { expect } from "vitest";
import { readSseFrames, parseSseJson } from "../../helpers/sse";

export interface ProviderTestConfig {
	providerId: string;
	baseModel: string; // e.g., "openai/gpt-4o-mini"
	gatewayUrl?: string;
	gatewayApiKey?: string;
	capabilities: {
		chatCompletions: boolean;
		responsesApi: boolean;
		anthropicMessages: boolean;
		streaming: boolean;
		tools: boolean;
		reasoning: boolean;
		vision: boolean;
		audio?: boolean;
		pdfInput?: boolean;
	};
}

export interface TestContext {
	totalTokensUsed: number;
	totalCostCents: number;
}

export function createTestContext(): TestContext {
	return {
		totalTokensUsed: 0,
		totalCostCents: 0,
	};
}

export function resolveGatewayUrl(baseUrl: string, path: string): string {
	const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	const suffix = path.startsWith("/") ? path : `/${path}`;
	return `${base}${suffix}`;
}

export async function runProtocol(
	config: ProviderTestConfig,
	path: string,
	body: any,
	opts?: { stream?: boolean }
): Promise<any> {
	const gatewayUrl = config.gatewayUrl ?? process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
	const apiKey = config.gatewayApiKey ?? process.env.GATEWAY_API_KEY ?? "";

	const requestBody =
		body && typeof body === "object"
			? { ...body, stream: Boolean(opts?.stream), usage: true, meta: true }
			: body;

	const res = await fetch(resolveGatewayUrl(gatewayUrl, path), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(requestBody),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Gateway ${res.status} ${res.statusText}: ${text}`);
	}

	if (opts?.stream) {
		const frames = parseSseJson(await readSseFrames(res));
		return { frames };
	}

	return await res.json();
}

export function getTotalTokens(usage: any): number {
	if (!usage || typeof usage !== "object") return 0;
	const total = usage.total_tokens;
	if (typeof total === "number") return total;
	const input = usage.input_tokens ?? usage.prompt_tokens ?? usage.input_text_tokens ?? 0;
	const output = usage.output_tokens ?? usage.completion_tokens ?? usage.output_text_tokens ?? 0;
	return Number(input) + Number(output);
}

export function getCostCents(response: any): number {
	if (!response || typeof response !== "object") return 0;

	const usage = response.usage;
	if (usage && typeof usage === "object") {
		if (usage.pricing && typeof usage.pricing === "object") {
			if (typeof usage.pricing.total_nanos === "number") {
				return usage.pricing.total_nanos / 10_000_000;
			}
			if (typeof usage.pricing.total_cents === "number") {
				return usage.pricing.total_cents;
			}
			if (typeof usage.pricing.total_usd_str === "string") {
				const dollars = parseFloat(usage.pricing.total_usd_str);
				if (!isNaN(dollars)) return dollars * 100;
			}
		}
		if (typeof usage.cost_cents === "number") return usage.cost_cents;
		if (usage.cost && typeof usage.cost === "object") {
			if (typeof usage.cost.cost_cents === "number") return usage.cost.cost_cents;
			if (typeof usage.cost.total_cents === "number") return usage.cost.total_cents;
		}
	}

	if (typeof response.cost_cents === "number") return response.cost_cents;
	if (response.cost?.cost_cents) return Number(response.cost.cost_cents);
	if (response.pricing?.cost_cents) return Number(response.pricing.cost_cents);

	return 0;
}

export function expectUsageTokens(response: any, context: TestContext): void {
	const totalTokens = getTotalTokens(response?.usage ?? {});
	expect(totalTokens).toBeGreaterThan(0);
	context.totalTokensUsed += totalTokens;
	context.totalCostCents += getCostCents(response);
}

export function expectStreamFrames(frames: any[], context: TestContext): void {
	const objects = frames.filter((entry) => entry && typeof entry === "object");
	expect(objects.length).toBeGreaterThan(0);
	const hasChoices = objects.some((entry) => Array.isArray(entry?.choices));
	const hasResponse = objects.some((entry) => entry?.response || entry?.object === "response");
	expect(hasChoices || hasResponse).toBe(true);

	// Track tokens and cost from streaming responses
	for (const frame of objects) {
		if (frame?.usage) {
			const tokens = getTotalTokens(frame.usage);
			if (tokens > 0) {
				context.totalTokensUsed += tokens;
				context.totalCostCents += getCostCents(frame);
				break;
			}
		}
	}
}

export function printTestSummary(context: TestContext, providerName: string): void {
	console.log("\n" + "=".repeat(60));
	console.log(`📊 ${providerName} Test Suite Summary`);
	console.log("=".repeat(60));
	console.log(`Total tokens used: ${context.totalTokensUsed.toLocaleString()}`);

	if (context.totalCostCents > 0) {
		const costDollars = context.totalCostCents / 100;
		console.log(`Total cost: $${costDollars.toFixed(4)} (${context.totalCostCents.toLocaleString()} cents)`);
	} else {
		console.log("Total cost: Not available");
	}

	console.log("=".repeat(60) + "\n");
}

// Test data fixtures
export const TEST_IMAGE_URL =
	"https://th.bing.com/th/id/R.b72dfea01bd45b862fa3c43228acc6ec?rik=KPkihyX9%2bIBwtA&riu=http%3a%2f%2ffoundtheworld.com%2fwp-content%2fuploads%2f2015%2f12%2fGolden-Gate-Bridge-4.jpg&ehk=mtwSRtfSVm9rpOZrEwBTNC%2fySKmIQekLMD2opw%2b71zs%3d&risl=&pid=ImgRaw&r=0";

export const TEST_IMAGE_BASE64 =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const TEST_TOOL_OPENAI = {
	type: "function",
	function: {
		name: "get_weather",
		description: "Get the current weather in a given location",
		parameters: {
			type: "object",
			properties: {
				location: { type: "string", description: "The city and state, e.g. San Francisco, CA" },
				unit: { type: "string", enum: ["celsius", "fahrenheit"] },
			},
			required: ["location"],
		},
	},
};

export const TEST_TOOL_ANTHROPIC = {
	name: "get_weather",
	description: "Get the current weather in a given location",
	input_schema: {
		type: "object",
		properties: {
			location: { type: "string", description: "The city and state, e.g. San Francisco, CA" },
			unit: { type: "string", enum: ["celsius", "fahrenheit"] },
		},
		required: ["location"],
	},
};
