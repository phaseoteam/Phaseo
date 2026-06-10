import { beforeAll, describe, expect, it } from "vitest";
import { parseSseJson, readSseFrames } from "../helpers/sse";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const INTERNAL_TEST_TOKEN = (
	process.env.LIVE_INTERNAL_TEST_TOKEN ??
	process.env.GATEWAY_INTERNAL_TEST_TOKEN ??
	""
).trim();
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const describeLive = LIVE_RUN ? describe : describe.skip;

const DEFAULT_PRO_MODELS = [
	"google/lyria-3-pro-preview",
	"google/lyria-3-pro",
	"lyria-3-pro-preview",
	"lyria-3-pro",
] as const;

const DEFAULT_CLIP_MODELS = [
	"google/lyria-3-clip-preview",
	"google/lyria-3-clip",
	"lyria-3-clip-preview",
	"lyria-3-clip",
] as const;

const PRO_MODEL_OVERRIDE = (process.env.LIVE_LYRIA_PRO_MODEL ?? "").trim();
const CLIP_MODEL_OVERRIDE = (process.env.LIVE_LYRIA_CLIP_MODEL ?? "").trim();

type GatewayModelProvider = {
	api_provider_id?: string;
	endpoint?: string;
	is_active_gateway?: boolean;
};

type GatewayModel = {
	model_id?: string;
	providers?: GatewayModelProvider[];
};

type ModelsResponse = {
	total?: number;
	models?: GatewayModel[];
};

type Variant = "pro" | "clip";

type PostJsonResult = {
	res: Response;
	jsonBody: any;
	text: string;
};

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
		headers["x-aistats-testing-mode"] = "1";
		headers["x-aistats-internal-token"] = INTERNAL_TEST_TOKEN;
	}
	return headers;
}

function toModelLookup(models: string[]): Map<string, string> {
	return new Map(models.map((modelId) => [modelId.toLowerCase(), modelId]));
}

function resolveModel(
	override: string,
	candidates: readonly string[],
	lookup: Map<string, string>,
): string {
	if (override) return override;
	for (const candidate of candidates) {
		const discovered = lookup.get(candidate.toLowerCase());
		if (discovered) return discovered;
	}
	return candidates[0];
}

async function discoverGoogleTextGenerateModels(): Promise<string[]> {
	const discovered = new Set<string>();
	let offset = 0;
	const limit = 250;
	let total = Number.POSITIVE_INFINITY;

	while (offset < total) {
		const url = new URL(resolveGatewayUrl("/models"));
		url.searchParams.set("limit", String(limit));
		url.searchParams.set("offset", String(offset));

		const response = await fetch(url.toString(), {
			method: "GET",
			headers: getHeaders(),
		});
		if (!response.ok) break;
		const payload = (await response.json()) as ModelsResponse;

		const models = payload.models ?? [];
		for (const model of models) {
			if (!model?.model_id) continue;
			const hasGoogleTextGenerate = (model.providers ?? []).some((provider) =>
				provider?.api_provider_id === "google-ai-studio" &&
				provider?.endpoint === "text.generate" &&
				provider?.is_active_gateway !== false
			);
			if (hasGoogleTextGenerate) discovered.add(model.model_id);
		}

		total = typeof payload.total === "number" ? payload.total : models.length;
		offset += limit;
		if (!models.length) break;
	}

	return [...discovered];
}

function getTotalTokens(usage: any): number {
	if (!usage || typeof usage !== "object") return 0;
	const total = usage.total_tokens ?? usage.totalTokens;
	if (typeof total === "number") return total;
	const input = usage.input_tokens ?? usage.prompt_tokens ?? usage.input_text_tokens ?? 0;
	const output = usage.output_tokens ?? usage.completion_tokens ?? usage.output_text_tokens ?? 0;
	return Number(input) + Number(output);
}

function extractUsage(payload: any): any {
	if (payload?.usage && typeof payload.usage === "object") return payload.usage;
	if (payload?.response?.usage && typeof payload.response.usage === "object") return payload.response.usage;
	return null;
}

function extractResponsesAudio(payload: any): any[] {
	const output = Array.isArray(payload?.output) ? payload.output : [];
	const audios: any[] = [];
	for (const item of output) {
		if (item?.type === "output_audio") {
			audios.push(item);
			continue;
		}
		if (item?.type !== "message" || !Array.isArray(item.content)) continue;
		for (const block of item.content) {
			if (block?.type === "output_audio") audios.push(block);
		}
	}
	return audios;
}

function extractResponsesText(payload: any): string[] {
	const parts: string[] = [];
	if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
		parts.push(payload.output_text.trim());
	}
	const output = Array.isArray(payload?.output) ? payload.output : [];
	for (const item of output) {
		if (item?.type !== "message" || !Array.isArray(item.content)) continue;
		for (const block of item.content) {
			if (block?.type === "output_text" && typeof block?.text === "string" && block.text.trim()) {
				parts.push(block.text.trim());
			}
		}
	}
	return parts;
}

function extractChatAudio(payload: any): any[] {
	const message = payload?.choices?.[0]?.message;
	return Array.isArray(message?.audios) ? message.audios : [];
}

function hasChatText(payload: any): boolean {
	const message = payload?.choices?.[0]?.message;
	if (typeof message?.content === "string" && message.content.trim()) return true;
	if (Array.isArray(message?.content)) {
		return message.content.some((part: any) => typeof part?.text === "string" && part.text.trim());
	}
	return false;
}

function hasAudioData(audio: any): boolean {
	return (
		typeof audio?.audio_url?.url === "string" ||
		typeof audio?.b64_json === "string"
	);
}

function hasUnsupportedModalitiesError(payload: any): boolean {
	const details = Array.isArray(payload?.details)
		? payload.details
		: Array.isArray(payload?.error?.details)
			? payload.error.details
			: [];
	return details.some((detail: any) => {
		const path = Array.isArray(detail?.path) ? detail.path.join(".") : "";
		const param = detail?.params?.param;
		return path === "modalities" || param === "modalities";
	});
}

async function postJson(path: "/responses" | "/chat/completions", body: Record<string, unknown>): Promise<PostJsonResult> {
	const res = await fetch(resolveGatewayUrl(path), {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify(body),
	});
	const text = await res.text();
	let jsonBody: any = null;
	try {
		jsonBody = text ? JSON.parse(text) : null;
	} catch {
		jsonBody = { raw: text };
	}
	return { res, jsonBody, text };
}

function buildBaseBody(path: "/responses" | "/chat/completions", model: string, stream = false): Record<string, unknown> {
	const prompt = "Compose a short uplifting synth hook, then include one sentence describing its mood.";
	if (path === "/responses") {
		return {
			model,
			input: prompt,
			stream,
			max_output_tokens: 256,
			modalities: ["text", "audio"],
			usage: true,
			meta: true,
		};
	}
	return {
		model,
		messages: [{ role: "user", content: prompt }],
		stream,
		max_output_tokens: 256,
		modalities: ["text", "audio"],
		usage: true,
		meta: true,
	};
}

describeLive("Lyria text.generate text+audio outputs", () => {
	const models: Record<Variant, string> = {
		pro: DEFAULT_PRO_MODELS[0],
		clip: DEFAULT_CLIP_MODELS[0],
	};

	beforeAll(async () => {
		if (!GATEWAY_API_KEY) {
			throw new Error("GATEWAY_API_KEY is required when LIVE_RUN=1");
		}

		const discovered = await discoverGoogleTextGenerateModels();
		const lookup = toModelLookup(discovered);
		models.pro = resolveModel(PRO_MODEL_OVERRIDE, DEFAULT_PRO_MODELS, lookup);
		models.clip = resolveModel(CLIP_MODEL_OVERRIDE, DEFAULT_CLIP_MODELS, lookup);

		console.log(`[lyria-live] discovered_google_text_generate=${discovered.length}`);
		console.log(`[lyria-live] pro_model=${models.pro}`);
		console.log(`[lyria-live] clip_model=${models.clip}`);
	});

	it.each(["pro", "clip"] as const)("returns text and audio on /responses (%s)", async (variant) => {
		const model = models[variant];
		const { res, jsonBody, text } = await postJson("/responses", buildBaseBody("/responses", model));
		if (!res.ok) {
			if (res.status === 400 && hasUnsupportedModalitiesError(jsonBody)) {
				throw new Error(`/responses rejected modalities for ${model}: ${text}`);
			}
			throw new Error(`/responses failed for ${model} (${res.status}): ${text}`);
		}

		const audios = extractResponsesAudio(jsonBody);
		expect(audios.length, `expected output_audio for ${model} on /responses`).toBeGreaterThan(0);
		expect(hasAudioData(audios[0]), `expected output_audio payload for ${model} on /responses`).toBe(true);

		const textParts = extractResponsesText(jsonBody).join(" ").trim();
		expect(textParts.length, `expected text content for ${model} on /responses`).toBeGreaterThan(0);

		expect(getTotalTokens(extractUsage(jsonBody)), `expected non-zero usage for ${model} on /responses`).toBeGreaterThan(0);
	}, 180_000);

	it.each(["pro", "clip"] as const)("returns text and audio on /chat/completions (%s)", async (variant) => {
		const model = models[variant];
		const { res, jsonBody, text } = await postJson("/chat/completions", buildBaseBody("/chat/completions", model));
		if (!res.ok) {
			if (res.status === 400 && hasUnsupportedModalitiesError(jsonBody)) {
				throw new Error(`/chat/completions rejected modalities for ${model}: ${text}`);
			}
			throw new Error(`/chat/completions failed for ${model} (${res.status}): ${text}`);
		}

		const audios = extractChatAudio(jsonBody);
		expect(audios.length, `expected message.audios for ${model} on /chat/completions`).toBeGreaterThan(0);
		expect(hasAudioData(audios[0]), `expected audio payload for ${model} on /chat/completions`).toBe(true);
		expect(hasChatText(jsonBody), `expected text content for ${model} on /chat/completions`).toBe(true);

		expect(getTotalTokens(extractUsage(jsonBody)), `expected non-zero usage for ${model} on /chat/completions`).toBeGreaterThan(0);
	}, 180_000);

	it.each(["pro", "clip"] as const)("streams text and audio on /responses (%s)", async (variant) => {
		const model = models[variant];
		const res = await fetch(resolveGatewayUrl("/responses"), {
			method: "POST",
			headers: getHeaders(),
			body: JSON.stringify(buildBaseBody("/responses", model, true)),
		});
		if (!res.ok) {
			const text = await res.text();
			let jsonBody: any = null;
			try {
				jsonBody = text ? JSON.parse(text) : null;
			} catch {
				jsonBody = { raw: text };
			}
			if (res.status === 400 && hasUnsupportedModalitiesError(jsonBody)) {
				throw new Error(`/responses stream rejected modalities for ${model}: ${text}`);
			}
			throw new Error(`/responses stream failed for ${model} (${res.status}): ${text}`);
		}

		const frames = await readSseFrames(res);
		const objects = parseSseJson(frames).filter((entry) => entry && typeof entry === "object") as any[];

		const hasAudio = objects.some((entry) => extractResponsesAudio(entry?.response ?? entry).length > 0);
		expect(hasAudio, `expected streamed output_audio for ${model} on /responses`).toBe(true);

		const hasText = objects.some((entry) => extractResponsesText(entry?.response ?? entry).join(" ").trim().length > 0);
		expect(hasText, `expected streamed text for ${model} on /responses`).toBe(true);

		const usageCarrier = [...objects].reverse().find((entry) => extractUsage(entry));
		expect(getTotalTokens(extractUsage(usageCarrier)), `expected non-zero usage for ${model} on /responses stream`).toBeGreaterThan(0);
	}, 180_000);

	it.each(["pro", "clip"] as const)("streams text and audio on /chat/completions (%s)", async (variant) => {
		const model = models[variant];
		const res = await fetch(resolveGatewayUrl("/chat/completions"), {
			method: "POST",
			headers: getHeaders(),
			body: JSON.stringify(buildBaseBody("/chat/completions", model, true)),
		});
		if (!res.ok) {
			const text = await res.text();
			let jsonBody: any = null;
			try {
				jsonBody = text ? JSON.parse(text) : null;
			} catch {
				jsonBody = { raw: text };
			}
			if (res.status === 400 && hasUnsupportedModalitiesError(jsonBody)) {
				throw new Error(`/chat/completions stream rejected modalities for ${model}: ${text}`);
			}
			throw new Error(`/chat/completions stream failed for ${model} (${res.status}): ${text}`);
		}

		const frames = await readSseFrames(res);
		const objects = parseSseJson(frames).filter((entry) => entry && typeof entry === "object") as any[];

		const hasAudio = objects.some((entry) => {
			if (extractChatAudio(entry).length > 0) return true;
			return Array.isArray(entry?.choices) &&
				entry.choices.some((choice: any) => Array.isArray(choice?.delta?.audios) && choice.delta.audios.length > 0);
		});
		expect(hasAudio, `expected streamed audios for ${model} on /chat/completions`).toBe(true);

		const hasText = objects.some((entry) => {
			if (hasChatText(entry)) return true;
			return Array.isArray(entry?.choices) &&
				entry.choices.some((choice: any) => {
					const deltaContent = choice?.delta?.content;
					if (typeof deltaContent === "string" && deltaContent.trim()) return true;
					if (Array.isArray(deltaContent)) {
						return deltaContent.some((part: any) => typeof part?.text === "string" && part.text.trim());
					}
					return false;
				});
		});
		expect(hasText, `expected streamed text for ${model} on /chat/completions`).toBe(true);

		const usageCarrier = [...objects].reverse().find((entry) => extractUsage(entry));
		expect(getTotalTokens(extractUsage(usageCarrier)), `expected non-zero usage for ${model} on /chat stream`).toBeGreaterThan(0);
	}, 180_000);
});
