import { beforeAll, describe, expect, it } from "vitest";
import { parseSseFrames, readSseFrames } from "../helpers/sse";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

const MODEL = "openai/gpt-5.4-nano";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const INTERNAL_TEST_TOKEN =
	(process.env.LIVE_INTERNAL_TEST_TOKEN ?? process.env.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();

const WEATHER_TOOL = {
	type: "function",
	function: {
		name: "get_weather",
		description: "Get weather for a city.",
		parameters: {
			type: "object",
			properties: {
				city: { type: "string" },
			},
			required: ["city"],
		},
	},
} as const;

function resolveGatewayUrl(path: string): string {
	const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
	const suffix = path.startsWith("/") ? path : `/${path}`;
	return `${base}${suffix}`;
}

function getHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${GATEWAY_API_KEY}`,
	};
	if (INTERNAL_TEST_TOKEN) {
		headers["x-internal-test-token"] = INTERNAL_TEST_TOKEN;
	}
	return headers;
}

async function postJson(path: string, body: Record<string, unknown>): Promise<any> {
	const response = await fetch(resolveGatewayUrl(path), {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify(body),
	});
	const text = await response.text();
	const parsed = text ? JSON.parse(text) : null;
	if (!response.ok) {
		throw new Error(`Gateway ${response.status} ${response.statusText}: ${text}`);
	}
	return parsed;
}

async function postStream(path: string, body: Record<string, unknown>) {
	const response = await fetch(resolveGatewayUrl(path), {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Gateway ${response.status} ${response.statusText}: ${text}`);
	}
	return parseSseFrames(await readSseFrames(response));
}

function extractAssistantTextFromChatResponse(response: any): string {
	const content = response?.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => (typeof part?.text === "string" ? part.text : ""))
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

describe("Live GPT-5.4 nano tool-calling through gateway", () => {
	beforeAll(() => {
		if (!GATEWAY_API_KEY) {
			throw new Error("GATEWAY_API_KEY is required for live tests");
		}
	});

	it("completes a native tool round-trip and returns final assistant text", async () => {
		const first = await postJson("/chat/completions", {
			model: MODEL,
			messages: [
				{
					role: "user",
					content: "Use the get_weather tool for London.",
				},
			],
			tools: [WEATHER_TOOL],
			tool_choice: {
				type: "function",
				function: { name: "get_weather" },
			},
			max_output_tokens: 120,
			usage: true,
			meta: true,
		});

		const toolCalls = first?.choices?.[0]?.message?.tool_calls ?? [];
		expect(Array.isArray(toolCalls)).toBe(true);
		expect(toolCalls.length).toBeGreaterThan(0);
		expect(toolCalls[0]?.function?.name).toBe("get_weather");
		expect(typeof toolCalls[0]?.id).toBe("string");

		const second = await postJson("/chat/completions", {
			model: MODEL,
			messages: [
				{
					role: "user",
					content: "Use the weather tool and then summarise weather in one concise sentence.",
				},
				{
					role: "assistant",
					content: "",
					tool_calls: toolCalls,
				},
				{
					role: "tool",
					tool_call_id: toolCalls[0].id,
					content: JSON.stringify({
						city: "London",
						temperature_c: 14,
						condition: "Cloudy",
					}),
				},
			],
			tools: [WEATHER_TOOL],
			max_output_tokens: 120,
			usage: true,
			meta: true,
		});

		const text = extractAssistantTextFromChatResponse(second);
		expect(text.length).toBeGreaterThan(0);
		expect(/london|cloudy|14/i.test(text)).toBe(true);
		expect(Number(second?.usage?.total_tokens ?? 0)).toBeGreaterThan(0);
	});

	it("streams with internal datetime server tool and returns final text + usage", async () => {
		const frames = await postStream("/chat/completions", {
			model: MODEL,
			stream: true,
			messages: [
				{
					role: "user",
					content: "Use datetime tool in UTC and return only a short datetime answer.",
				},
			],
			tools: [
				{
					type: "gateway:datetime",
					parameters: {
						timezone: "UTC",
					},
				},
			],
			tool_choice: "gateway:datetime",
			max_output_tokens: 120,
			usage: true,
			meta: true,
		});

		expect(frames.length).toBeGreaterThan(0);

		let streamedText = "";
		let sawDone = false;
		let usagePayload: any = null;
		for (const frame of frames) {
			if (frame.data === "[DONE]") {
				sawDone = true;
				continue;
			}
			const json = frame.json;
			if (!json || typeof json !== "object") continue;
			const delta = json?.choices?.[0]?.delta;
			if (typeof delta?.content === "string") {
				streamedText += delta.content;
			}
			if (json?.usage && typeof json.usage === "object") {
				usagePayload = json.usage;
			}
		}

		expect(sawDone).toBe(true);
		expect(streamedText.trim().length).toBeGreaterThan(0);
		expect(Number(usagePayload?.total_tokens ?? 0)).toBeGreaterThan(0);
		expect(Number(usagePayload?.server_tool_use?.datetime_requests ?? 0)).toBeGreaterThan(0);
	});
});
