import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

type ModelProviderRef = {
	api_provider_id?: string;
	endpoint?: string;
	is_active_gateway?: boolean;
};

type GatewayModel = {
	model_id?: string;
	endpoints?: string[];
	providers?: ModelProviderRef[];
};

type ModelsResponse = {
	total?: number;
	models?: GatewayModel[];
};

type GatewayCallResult = {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	contentType: string;
	json?: any;
	bytes?: Buffer;
};

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const LIVE_MEDIA_RUN = (process.env.LIVE_MEDIA_RUN ?? "").trim() === "1";
const describeLive = LIVE_RUN && LIVE_MEDIA_RUN ? describe : describe.skip;

const POLL_ATTEMPTS = Number(process.env.LIVE_MEDIA_VIDEO_POLL_ATTEMPTS ?? "6");
const POLL_DELAY_MS = Number(process.env.LIVE_MEDIA_VIDEO_POLL_DELAY_MS ?? "3000");

const TINY_PNG_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const MODEL_CANDIDATES = {
	openaiImage: [
		"openai/gpt-image-1-mini",
		"gpt-image-1-mini",
		"openai/gpt-image-1",
		"gpt-image-1",
	],
	blackForestImage: [
		"black-forest-labs/flux-2-klein-4b",
		"flux-2-klein-4b",
		"black-forest-labs/flux-2-krea-4b",
		"flux-2-krea-4b",
	],
	xaiImage: [
		"x-ai/grok-imagine-image",
		"xai/grok-imagine-image",
		"grok-imagine-image",
		"x-ai/grok-image-1",
		"xai/grok-image-1",
		"grok-image-1",
	],
	openaiTts: ["openai/gpt-4o-mini-tts", "gpt-4o-mini-tts"],
	googleTts: [
		"google/gemini-2.5-flash-preview-tts",
		"gemini-2.5-flash-preview-tts",
		"google/gemini-2.5-flash-tts",
		"gemini-2.5-flash-tts",
	],
	googleVideo: [
		"google/veo-3.1-fast-preview",
		"veo-3.1-fast-preview",
		"google/veo-3-fast-preview",
		"veo-3-fast-preview",
	],
	openaiVideo: ["openai/sora-2", "sora-2"],
} as const;

const MODEL_KEYWORDS = {
	blackForestImage: ["flux", "klein", "krea", "4b"],
	xaiImage: ["grok", "imagine", "image"],
	openaiTts: ["tts"],
	googleTts: ["gemini", "tts"],
	googleVideo: ["veo", "fast"],
	openaiVideo: ["sora", "2"],
} as const;

const PROVIDER_PREFS = {
	google: ["google-ai-studio", "google"],
	xai: ["x-ai", "xai"],
	blackForest: ["black-forest-labs"],
	openai: ["openai"],
} as const;

const ARTIFACT_ROOT =
	process.env.LIVE_MEDIA_ARTIFACT_DIR?.trim() ||
	path.resolve(
		process.cwd(),
		"reports",
		"media-live",
		new Date().toISOString().replace(/[:.]/g, "-"),
	);

let catalog: GatewayModel[] = [];
let providerMap = new Map<string, string[]>();
let resolvedModels: Record<string, string> = {
	openaiImage: MODEL_CANDIDATES.openaiImage[0],
	blackForestImage: MODEL_CANDIDATES.blackForestImage[0],
	xaiImage: MODEL_CANDIDATES.xaiImage[0],
	openaiTts: MODEL_CANDIDATES.openaiTts[0],
	googleTts: MODEL_CANDIDATES.googleTts[0],
	googleVideo: MODEL_CANDIDATES.googleVideo[0],
	openaiVideo: MODEL_CANDIDATES.openaiVideo[0],
};

function toHeadersObject(headers: Headers): Record<string, string> {
	return Object.fromEntries(Array.from(headers.entries()));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveGatewayUrl(pathname: string): string {
	const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
	const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return `${base}${suffix}`;
}

function getAuthHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${GATEWAY_API_KEY}`,
		"Content-Type": "application/json",
	};
}

function trimString(value: string, max = 400): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max)}... [${value.length} chars]`;
}

function sanitizeForLog(value: unknown): unknown {
	if (value == null) return value;
	if (typeof value === "string") return trimString(value, 1000);
	if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
			if (typeof field === "string" && (key.includes("b64") || key.includes("audio") || key.includes("image"))) {
				out[key] = trimString(field, 180);
				continue;
			}
			out[key] = sanitizeForLog(field);
		}
		return out;
	}
	return value;
}

function logJson(label: string, payload: unknown) {
	console.log(`[live-media] ${label}`);
	console.log(JSON.stringify(sanitizeForLog(payload), null, 2));
}

function extFromMime(mimeType: string | null | undefined, fallback = ".bin"): string {
	const mime = String(mimeType ?? "").toLowerCase();
	if (mime.includes("png")) return ".png";
	if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
	if (mime.includes("webp")) return ".webp";
	if (mime.includes("gif")) return ".gif";
	if (mime.includes("wav")) return ".wav";
	if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
	if (mime.includes("ogg")) return ".ogg";
	if (mime.includes("flac")) return ".flac";
	if (mime.includes("aac")) return ".aac";
	if (mime.includes("mp4")) return ".mp4";
	return fallback;
}

function safeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function writeArtifact(baseName: string, bytes: Buffer, ext: string): Promise<string> {
	const filename = `${safeFilename(baseName)}${ext}`;
	const fullPath = path.join(ARTIFACT_ROOT, filename);
	await fs.writeFile(fullPath, bytes);
	return fullPath;
}

async function fetchModelsCatalog(): Promise<GatewayModel[]> {
	const out: GatewayModel[] = [];
	let offset = 0;
	const limit = 250;
	let total = Number.POSITIVE_INFINITY;

	while (offset < total) {
		const url = new URL(resolveGatewayUrl("/gateway/models"));
		url.searchParams.set("offset", String(offset));
		url.searchParams.set("limit", String(limit));
		const res = await fetch(url.toString(), {
			method: "GET",
			headers: {
				Authorization: `Bearer ${GATEWAY_API_KEY}`,
			},
		});
		const payload = (await res.json()) as ModelsResponse;
		if (!res.ok) {
			throw new Error(`Failed to load /gateway/models (${res.status}): ${JSON.stringify(payload)}`);
		}
		const models = payload.models ?? [];
		out.push(...models);
		total = typeof payload.total === "number" ? payload.total : models.length;
		offset += limit;
		if (!models.length) break;
	}

	return out;
}

function modelSupportsProvider(model: GatewayModel, providerId: string): boolean {
	const providers = model.providers ?? [];
	return providers.some((provider) => provider.api_provider_id === providerId && provider.is_active_gateway !== false);
}

function buildProviderModelMap(models: GatewayModel[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const model of models) {
		const modelId = model.model_id;
		if (!modelId) continue;
		for (const provider of model.providers ?? []) {
			const providerId = provider.api_provider_id;
			if (!providerId || provider.is_active_gateway === false) continue;
			const list = out.get(providerId) ?? [];
			if (!list.includes(modelId)) list.push(modelId);
			out.set(providerId, list);
		}
	}
	return out;
}

function findProviderOrFallback(preferred: readonly string[]): string {
	for (const providerId of preferred) {
		if (providerMap.has(providerId)) return providerId;
	}
	return preferred[0];
}

function chooseModel(
	key: keyof typeof MODEL_CANDIDATES,
	providerCandidates: readonly string[],
	envOverride?: string,
): string {
	const override = envOverride?.trim();
	if (override) return override;

	const providerModels = providerCandidates.flatMap((providerId) => providerMap.get(providerId) ?? []);
	if (!providerModels.length) {
		return MODEL_CANDIDATES[key][0];
	}

	const lowerMap = new Map(providerModels.map((modelId) => [modelId.toLowerCase(), modelId]));
	for (const candidate of MODEL_CANDIDATES[key]) {
		const resolved = lowerMap.get(candidate.toLowerCase());
		if (resolved) return resolved;
	}

	const keywords = MODEL_KEYWORDS[key as keyof typeof MODEL_KEYWORDS];
	if (keywords && keywords.length) {
		const ranked = [...providerModels]
			.filter((modelId) => {
				const lower = modelId.toLowerCase();
				return keywords.every((keyword) => lower.includes(keyword));
			})
			.sort((a, b) => a.localeCompare(b));
		if (ranked.length) return ranked[0];
	}

	return providerModels.sort((a, b) => a.localeCompare(b))[0];
}

async function postGateway(pathname: string, body: Record<string, unknown>): Promise<GatewayCallResult> {
	logJson(`REQUEST ${pathname}`, body);
	const res = await fetch(resolveGatewayUrl(pathname), {
		method: "POST",
		headers: getAuthHeaders(),
		body: JSON.stringify(body),
	});
	const contentType = res.headers.get("content-type") ?? "";
	const headers = toHeadersObject(res.headers);

	if (contentType.includes("application/json")) {
		const json = await res.clone().json().catch(async () => {
			const text = await res.clone().text();
			return { raw: text };
		});
		const output = {
			status: res.status,
			statusText: res.statusText,
			headers,
			contentType,
			json,
		};
		logJson(`RESPONSE ${pathname}`, output);
		return output;
	}

	const bytes = Buffer.from(await res.arrayBuffer());
	const output = {
		status: res.status,
		statusText: res.statusText,
		headers,
		contentType,
		bytes,
	};
	logJson(`RESPONSE ${pathname}`, {
		status: output.status,
		statusText: output.statusText,
		headers: output.headers,
		contentType: output.contentType,
		byteLength: output.bytes.length,
		first16Hex: output.bytes.subarray(0, 16).toString("hex"),
	});
	return output;
}

async function getGateway(pathname: string): Promise<GatewayCallResult> {
	const res = await fetch(resolveGatewayUrl(pathname), {
		method: "GET",
		headers: {
			Authorization: `Bearer ${GATEWAY_API_KEY}`,
		},
	});
	const contentType = res.headers.get("content-type") ?? "";
	const headers = toHeadersObject(res.headers);

	if (contentType.includes("application/json")) {
		const json = await res.clone().json().catch(async () => {
			const text = await res.clone().text();
			return { raw: text };
		});
		const output = {
			status: res.status,
			statusText: res.statusText,
			headers,
			contentType,
			json,
		};
		logJson(`RESPONSE GET ${pathname}`, output);
		return output;
	}

	const bytes = Buffer.from(await res.arrayBuffer());
	const output = {
		status: res.status,
		statusText: res.statusText,
		headers,
		contentType,
		bytes,
	};
	logJson(`RESPONSE GET ${pathname}`, {
		status: output.status,
		statusText: output.statusText,
		headers: output.headers,
		contentType: output.contentType,
		byteLength: output.bytes.length,
		first16Hex: output.bytes.subarray(0, 16).toString("hex"),
	});
	return output;
}

function extractFirstImageRef(payload: any): { type: "b64" | "url"; value: string; mimeType?: string } | null {
	const data = Array.isArray(payload?.data) ? payload.data : [];
	for (const item of data) {
		if (typeof item?.b64_json === "string" && item.b64_json.length > 0) {
			return { type: "b64", value: item.b64_json, mimeType: item?.mime_type ?? item?.mimeType };
		}
		if (typeof item?.url === "string" && item.url.length > 0) {
			return { type: "url", value: item.url, mimeType: item?.mime_type ?? item?.mimeType };
		}
	}
	return null;
}

async function materializeImage(caseId: string, payload: any): Promise<string | null> {
	const imageRef = extractFirstImageRef(payload);
	if (!imageRef) return null;

	if (imageRef.type === "b64") {
		const bytes = Buffer.from(imageRef.value, "base64");
		const artifact = await writeArtifact(caseId, bytes, extFromMime(imageRef.mimeType, ".png"));
		logJson(`${caseId} image artifact`, {
			kind: "b64_json",
			mimeType: imageRef.mimeType ?? null,
			byteLength: bytes.length,
			path: artifact,
		});
		return artifact;
	}

	if (imageRef.value.startsWith("data:")) {
		const match = imageRef.value.match(/^data:([^;]+);base64,(.+)$/);
		if (!match) return null;
		const bytes = Buffer.from(match[2], "base64");
		const artifact = await writeArtifact(caseId, bytes, extFromMime(match[1], ".png"));
		logJson(`${caseId} image artifact`, {
			kind: "data_url",
			mimeType: match[1],
			byteLength: bytes.length,
			path: artifact,
		});
		return artifact;
	}

	const fetched = await fetch(imageRef.value);
	const bytes = Buffer.from(await fetched.arrayBuffer());
	const mimeType = fetched.headers.get("content-type") ?? imageRef.mimeType ?? "application/octet-stream";
	const artifact = await writeArtifact(caseId, bytes, extFromMime(mimeType, ".bin"));
	logJson(`${caseId} image artifact`, {
		kind: "url",
		sourceUrl: imageRef.value,
		status: fetched.status,
		mimeType,
		byteLength: bytes.length,
		path: artifact,
	});
	return artifact;
}

function extractVideoId(payload: any): string | null {
	if (typeof payload?.id === "string" && payload.id.length > 0) return payload.id;
	return null;
}

function extractVideoStatus(payload: any): string {
	return String(payload?.status ?? "").toLowerCase();
}

async function tryFetchVideoContent(videoId: string, caseId: string): Promise<string | null> {
	const contentResponse = await getGateway(`/videos/${encodeURIComponent(videoId)}/content`);
	if (contentResponse.status < 200 || contentResponse.status >= 300 || !contentResponse.bytes) {
		return null;
	}
	const artifact = await writeArtifact(caseId, contentResponse.bytes, extFromMime(contentResponse.contentType, ".mp4"));
	logJson(`${caseId} video artifact`, {
		videoId,
		contentType: contentResponse.contentType,
		byteLength: contentResponse.bytes.length,
		path: artifact,
	});
	return artifact;
}

async function pollVideoUntilReady(videoId: string, caseId: string): Promise<any> {
	let latest: any = null;
	for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
		const statusResponse = await getGateway(`/videos/${encodeURIComponent(videoId)}`);
		latest = statusResponse.json ?? null;
		const status = extractVideoStatus(latest);
		logJson(`${caseId} poll`, {
			attempt,
			videoId,
			status,
		});
		if (status === "completed" || status === "failed") break;
		if (attempt < POLL_ATTEMPTS) {
			await sleep(POLL_DELAY_MS);
		}
	}
	return latest;
}

describeLive("Live multimodal media smoke (verbose diagnostics)", () => {
	const providers = {
		openai: PROVIDER_PREFS.openai[0],
		google: PROVIDER_PREFS.google[0],
		xai: PROVIDER_PREFS.xai[0],
		blackForest: PROVIDER_PREFS.blackForest[0],
	};

	beforeAll(async () => {
		if (!GATEWAY_API_KEY) {
			throw new Error("GATEWAY_API_KEY is required when LIVE_RUN=1 and LIVE_MEDIA_RUN=1");
		}

		await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
		console.log(`[live-media] artifacts: ${ARTIFACT_ROOT}`);

		catalog = await fetchModelsCatalog();
		providerMap = buildProviderModelMap(catalog);
		logJson("provider model counts", Object.fromEntries(
			Array.from(providerMap.entries()).map(([providerId, models]) => [providerId, models.length]),
		));

		providers.google = findProviderOrFallback(PROVIDER_PREFS.google);
		providers.xai = findProviderOrFallback(PROVIDER_PREFS.xai);

		resolvedModels.openaiImage = chooseModel("openaiImage", [providers.openai], process.env.LIVE_MEDIA_MODEL_OPENAI_IMAGE);
		resolvedModels.blackForestImage = chooseModel(
			"blackForestImage",
			[providers.blackForest],
			process.env.LIVE_MEDIA_MODEL_BFL_IMAGE,
		);
		resolvedModels.xaiImage = chooseModel("xaiImage", [providers.xai], process.env.LIVE_MEDIA_MODEL_XAI_IMAGE);
		resolvedModels.openaiTts = chooseModel("openaiTts", [providers.openai], process.env.LIVE_MEDIA_MODEL_OPENAI_TTS);
		resolvedModels.googleTts = chooseModel("googleTts", [providers.google], process.env.LIVE_MEDIA_MODEL_GOOGLE_TTS);
		resolvedModels.googleVideo = chooseModel("googleVideo", [providers.google], process.env.LIVE_MEDIA_MODEL_GOOGLE_VIDEO);
		resolvedModels.openaiVideo = chooseModel("openaiVideo", [providers.openai], process.env.LIVE_MEDIA_MODEL_OPENAI_VIDEO);

		logJson("resolved providers", providers);
		logJson("resolved models", resolvedModels);
	});

	it("OpenAI image generation: text input -> image output", async () => {
		const body = {
			model: resolvedModels.openaiImage,
			prompt: "red circle",
			n: 1,
			size: "1024x1024",
			provider: { only: [providers.openai] },
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
				return_upstream_response: true,
			},
		};
		const response = await postGateway("/images/generations", body);
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(300);
		expect(response.json?.data?.length ?? 0).toBeGreaterThan(0);
		const artifact = await materializeImage("openai-image-text", response.json);
		expect(Boolean(artifact)).toBe(true);
		logJson("openai-image-text upstream", {
			upstream_request: response.json?.upstream_request ?? null,
			upstream_response: response.json?.upstream_response ?? null,
		});
	}, 180_000);

	it("OpenAI image generation: image input (/images/edits) -> image output", async () => {
		const body = {
			model: resolvedModels.openaiImage,
			image: TINY_PNG_DATA_URL,
			prompt: "blue circle",
			n: 1,
			size: "1024x1024",
			provider: { only: [providers.openai] },
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
				return_upstream_response: true,
			},
		};
		const response = await postGateway("/images/edits", body);
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(300);
		expect(response.json?.data?.length ?? 0).toBeGreaterThan(0);
		const artifact = await materializeImage("openai-image-edit", response.json);
		expect(Boolean(artifact)).toBe(true);
		logJson("openai-image-edit upstream", {
			upstream_request: response.json?.upstream_request ?? null,
			upstream_response: response.json?.upstream_response ?? null,
		});
	}, 180_000);

	it("Black Forest Labs image generation (Flux 2 Klein 4B target)", async () => {
		const body = {
			model: resolvedModels.blackForestImage,
			prompt: "green square",
			n: 1,
			provider: { only: [providers.blackForest] },
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
				return_upstream_response: true,
			},
		};
		const response = await postGateway("/images/generations", body);
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(300);
		expect(response.json?.data?.length ?? 0).toBeGreaterThan(0);
		const artifact = await materializeImage("bfl-image", response.json);
		expect(Boolean(artifact)).toBe(true);
		logJson("bfl-image upstream", {
			upstream_request: response.json?.upstream_request ?? null,
			upstream_response: response.json?.upstream_response ?? null,
		});
	}, 180_000);

	it("xAI image generation (Grok Imagine Image target)", async () => {
		const body = {
			model: resolvedModels.xaiImage,
			prompt: "yellow triangle",
			n: 1,
			provider: { only: [providers.xai] },
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
				return_upstream_response: true,
			},
		};
		const response = await postGateway("/images/generations", body);
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(300);
		expect(response.json?.data?.length ?? 0).toBeGreaterThan(0);
		const artifact = await materializeImage("xai-image", response.json);
		expect(Boolean(artifact)).toBe(true);
		logJson("xai-image upstream", {
			upstream_request: response.json?.upstream_request ?? null,
			upstream_response: response.json?.upstream_response ?? null,
		});
	}, 180_000);

	it("OpenAI audio speech (gpt-4o-mini-tts) with binary artifact logging", async () => {
		const body = {
			model: resolvedModels.openaiTts,
			input: "hello",
			voice: "alloy",
			response_format: "wav",
			provider: { only: [providers.openai] },
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
				return_upstream_response: true,
			},
		};
		const response = await postGateway("/audio/speech", body);
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(300);
		expect(response.bytes).toBeTruthy();
		const artifact = await writeArtifact(
			"openai-tts",
			response.bytes ?? Buffer.alloc(0),
			extFromMime(response.contentType, ".wav"),
		);
		logJson("openai-tts artifact", {
			contentType: response.contentType,
			byteLength: response.bytes?.length ?? 0,
			path: artifact,
			note: "audio.speech returns binary payloads, so upstream_request/upstream_response are not in response body",
		});
	}, 180_000);

	it("Google audio speech (Gemini 2.5 Flash Preview TTS) with binary artifact logging", async () => {
		const body = {
			model: resolvedModels.googleTts,
			input: "hello",
			voice: "Kore",
			provider: { only: [providers.google] },
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
				return_upstream_response: true,
			},
		};
		const response = await postGateway("/audio/speech", body);
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(300);
		expect(response.bytes).toBeTruthy();
		const artifact = await writeArtifact(
			"google-tts",
			response.bytes ?? Buffer.alloc(0),
			extFromMime(response.contentType, ".wav"),
		);
		logJson("google-tts artifact", {
			contentType: response.contentType,
			byteLength: response.bytes?.length ?? 0,
			path: artifact,
			note: "audio.speech returns binary payloads, so upstream_request/upstream_response are not in response body",
		});
	}, 180_000);

	it("Google video generation (Veo 3.1 Fast target) with polling and artifact attempt", async () => {
		const body = {
			model: resolvedModels.googleVideo,
			prompt: "cat walking",
			duration_seconds: 2,
			aspect_ratio: "16:9",
			generate_audio: false,
			provider: { only: [providers.google] },
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
				return_upstream_response: true,
			},
		};
		const response = await postGateway("/videos", body);
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(300);
		expect(response.json?.id).toBeTruthy();
		logJson("google-video upstream", {
			upstream_request: response.json?.upstream_request ?? null,
			upstream_response: response.json?.upstream_response ?? null,
		});

		const videoId = extractVideoId(response.json);
		expect(videoId).toBeTruthy();
		const latest = videoId ? await pollVideoUntilReady(videoId, "google-video") : null;
		const status = extractVideoStatus(latest);
		expect(status === "queued" || status === "in_progress" || status === "completed").toBe(true);
		if (status === "completed" && videoId) {
			await tryFetchVideoContent(videoId, "google-video");
		}
	}, 300_000);

	it("OpenAI video generation (Sora 2 target) with polling and artifact attempt", async () => {
		const body = {
			model: resolvedModels.openaiVideo,
			prompt: "dog running",
			seconds: 2,
			provider: { only: [providers.openai] },
			meta: true,
			debug: {
				enabled: true,
				return_upstream_request: true,
				return_upstream_response: true,
			},
		};
		const response = await postGateway("/videos", body);
		expect(response.status).toBeGreaterThanOrEqual(200);
		expect(response.status).toBeLessThan(300);
		expect(response.json?.id).toBeTruthy();
		logJson("openai-video upstream", {
			upstream_request: response.json?.upstream_request ?? null,
			upstream_response: response.json?.upstream_response ?? null,
		});

		const videoId = extractVideoId(response.json);
		expect(videoId).toBeTruthy();
		const latest = videoId ? await pollVideoUntilReady(videoId, "openai-video") : null;
		const status = extractVideoStatus(latest);
		expect(status === "queued" || status === "in_progress" || status === "completed").toBe(true);
		if (status === "completed" && videoId) {
			await tryFetchVideoContent(videoId, "openai-video");
		}
	}, 300_000);
});
