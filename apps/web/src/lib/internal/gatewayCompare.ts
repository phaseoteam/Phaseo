export type CompareTarget = "ai-stats" | "openrouter";

export type CompareArgs = {
	model: string;
	prompt: string;
	runs: number;
	maxCompletionTokens: number;
	endpoint: "chat_completions" | "responses";
	gatewayBaseUrl?: string;
	openRouterBaseUrl?: string;
};

export type FrameTrace = {
	atMs: number;
	event: string | null;
	object: string | null;
	type: string | null;
	dataKind: "json" | "done" | "non-json";
	dataPreview: string | null;
	hasContent: boolean;
	contentLength: number;
	hasUsage: boolean;
	isDone: boolean;
	rawBytesSeen: number;
};

export type CompareTraceResult = {
	target: CompareTarget;
	run: number;
	ok: boolean;
	status: number;
	headersMs: number;
	firstByteMs: number | null;
	firstFrameMs: number | null;
	firstJsonFrameMs: number | null;
	firstContentMs: number | null;
	firstUsageMs: number | null;
	doneMs: number | null;
	totalMs: number;
	bodyBytes: number;
	chunkCount: number;
	frameCount: number;
	contentFrameCount: number;
	firstFrames: FrameTrace[];
	serverTiming: Record<string, number> | null;
	gatewayStageBreakdown: GatewayStageBreakdown | null;
	error: string | null;
};

export type Stats = {
	min: number;
	p50: number;
	avg: number;
	max: number;
};

export type CompareSummary = {
	target: CompareTarget;
	successes: number;
	failures: number;
	headersMs: Stats | null;
	firstByteMs: Stats | null;
	firstContentMs: Stats | null;
	totalMs: Stats | null;
	stageSummary: GatewayStageSummary | null;
};

export type GatewayStageBreakdown = {
	beforeMs: number | null;
	protocolDetectMs: number | null;
	irDecodeMs: number | null;
	executeGuardCandidatesMs: number | null;
	executeFilterModalitiesMs: number | null;
	executeRankProvidersMs: number | null;
	attemptBreakerMs: number | null;
	attemptLoadPricecardMs: number | null;
	attemptResolveExecutorMs: number | null;
	attemptNormalizeIrMs: number | null;
	attemptRequestBuildMs: number | null;
	attemptUpstreamHeadersMs: number | null;
	headersToFirstByteMs: number | null;
	headersToFirstContentMs: number | null;
	accountedHeadersMs: number | null;
	unaccountedHeadersMs: number | null;
};

export type GatewayStageSummary = {
	beforeMs: Stats | null;
	protocolDetectMs: Stats | null;
	irDecodeMs: Stats | null;
	executeGuardCandidatesMs: Stats | null;
	executeFilterModalitiesMs: Stats | null;
	executeRankProvidersMs: Stats | null;
	attemptBreakerMs: Stats | null;
	attemptLoadPricecardMs: Stats | null;
	attemptResolveExecutorMs: Stats | null;
	attemptNormalizeIrMs: Stats | null;
	attemptRequestBuildMs: Stats | null;
	attemptUpstreamHeadersMs: Stats | null;
	headersToFirstByteMs: Stats | null;
	headersToFirstContentMs: Stats | null;
	accountedHeadersMs: Stats | null;
	unaccountedHeadersMs: Stats | null;
};

const DEFAULT_GATEWAY_BASE_URL = "https://api.phaseo.app/v1";
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function normalizeCompareBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

export function endpointUrl(
	baseUrl: string,
	endpoint: CompareArgs["endpoint"],
): string {
	const normalized = normalizeCompareBaseUrl(baseUrl);
	return endpoint === "responses"
		? `${normalized}/responses`
		: `${normalized}/chat/completions`;
}

export function buildCompareHeaders(target: CompareTarget, apiKey: string): HeadersInit {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
		"Content-Type": "application/json",
		"User-Agent": "ai-stats-internal-gateway-compare/1.0",
	};
	if (target === "openrouter") {
		headers["HTTP-Referer"] = "https://ai-stats.com";
		headers["X-Title"] = "AI Stats Internal Gateway Compare";
	}
	return headers;
}

export function buildCompareBody(args: CompareArgs) {
	if (args.endpoint === "responses") {
		return {
			model: args.model,
			input: [
				{
					role: "user",
					content: args.prompt,
				},
			],
			max_output_tokens: args.maxCompletionTokens,
			reasoning: { effort: "low" },
			stream: true,
		};
	}

	return {
		model: args.model,
		messages: [{ role: "user", content: args.prompt }],
		max_completion_tokens: args.maxCompletionTokens,
		stream: true,
	};
}

export function parseSseFrame(raw: string): { event: string | null; data: string } {
	let event: string | null = null;
	let data = "";
	for (const line of raw.split(/\n/)) {
		const normalized = line.replace(/\r$/, "");
		if (normalized.startsWith("event:")) event = normalized.slice(6).trim();
		if (normalized.startsWith("data:")) data += normalized.slice(5).trimStart();
	}
	return { event, data };
}

export function parseJsonObject(text: string): any | null {
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function parseServerTiming(header: string | null): Record<string, number> | null {
	if (!header) return null;
	const snapshot: Record<string, number> = {};
	for (const part of header.split(",")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const [name, ...params] = trimmed.split(";");
		const key = name.trim();
		if (!key) continue;
		const durParam = params.find((param) => param.trim().startsWith("dur="));
		if (!durParam) continue;
		const value = Number(durParam.trim().slice(4));
		if (Number.isFinite(value)) snapshot[key] = round3(value);
	}
	return Object.keys(snapshot).length ? snapshot : null;
}

function getTiming(snapshot: Record<string, number> | null, key: string): number | null {
	if (!snapshot) return null;
	const value = snapshot[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function contentLengthFromFrame(frame: any): number {
	const chatContent = frame?.choices?.[0]?.delta?.content;
	if (typeof chatContent === "string") return chatContent.length;
	const responseDelta = frame?.delta;
	if (typeof responseDelta === "string") return responseDelta.length;
	const outputText = frame?.response?.output_text;
	if (typeof outputText === "string") return outputText.length;
	return 0;
}

function recordFrame(firstFrames: FrameTrace[], frame: FrameTrace) {
	if (firstFrames.length >= 8) return;
	firstFrames.push(frame);
}

function round3(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function sumStageValues(values: Array<number | null>): number | null {
	const filtered = values.filter((value): value is number => typeof value === "number");
	if (!filtered.length) return null;
	return round3(filtered.reduce((acc, value) => acc + value, 0));
}

function stats(values: Array<number | null>): Stats | null {
	const sorted = values
		.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
		.sort((a, b) => a - b);
	if (!sorted.length) return null;
	const sum = sorted.reduce((acc, value) => acc + value, 0);
	return {
		min: round3(sorted[0]),
		p50: round3(sorted[Math.ceil(sorted.length * 0.5) - 1]),
		avg: round3(sum / sorted.length),
		max: round3(sorted[sorted.length - 1]),
	};
}

function buildGatewayStageBreakdown(
	serverTiming: Record<string, number> | null,
	headersMs: number,
	firstByteMs: number | null,
	firstContentMs: number | null,
): GatewayStageBreakdown | null {
	if (!serverTiming) return null;
	const beforeMs = getTiming(serverTiming, "before_start");
	const protocolDetectMs = getTiming(serverTiming, "protocol_detect");
	const irDecodeMs = getTiming(serverTiming, "ir_decode");
	const executeGuardCandidatesMs = getTiming(serverTiming, "execute_guard_candidates");
	const executeFilterModalitiesMs = getTiming(serverTiming, "execute_filter_modalities");
	const executeRankProvidersMs = getTiming(serverTiming, "execute_rank_providers");
	const attemptBreakerMs = getTiming(serverTiming, "attempt_1_breaker");
	const attemptLoadPricecardMs = getTiming(serverTiming, "attempt_1_load_pricecard");
	const attemptResolveExecutorMs = getTiming(serverTiming, "attempt_1_resolve_executor");
	const attemptNormalizeIrMs = getTiming(serverTiming, "attempt_1_normalize_ir");
	const attemptRequestBuildMs = getTiming(serverTiming, "attempt_1_request_build");
	const attemptUpstreamHeadersMs = getTiming(serverTiming, "attempt_1_upstream_headers");
	const accountedHeadersMs = sumStageValues([
		beforeMs,
		protocolDetectMs,
		irDecodeMs,
		executeGuardCandidatesMs,
		executeFilterModalitiesMs,
		executeRankProvidersMs,
		attemptBreakerMs,
		attemptLoadPricecardMs,
		attemptResolveExecutorMs,
		attemptNormalizeIrMs,
		attemptRequestBuildMs,
		attemptUpstreamHeadersMs,
	]);
	return {
		beforeMs,
		protocolDetectMs,
		irDecodeMs,
		executeGuardCandidatesMs,
		executeFilterModalitiesMs,
		executeRankProvidersMs,
		attemptBreakerMs,
		attemptLoadPricecardMs,
		attemptResolveExecutorMs,
		attemptNormalizeIrMs,
		attemptRequestBuildMs,
		attemptUpstreamHeadersMs,
		headersToFirstByteMs:
			typeof firstByteMs === "number" ? round3(Math.max(0, firstByteMs - headersMs)) : null,
		headersToFirstContentMs:
			typeof firstContentMs === "number"
				? round3(Math.max(0, firstContentMs - headersMs))
				: null,
		accountedHeadersMs,
		unaccountedHeadersMs:
			typeof accountedHeadersMs === "number"
				? round3(Math.max(0, headersMs - accountedHeadersMs))
				: null,
	};
}

async function traceOne(
	target: CompareTarget,
	run: number,
	args: CompareArgs,
	keys: { gatewayApiKey: string; openRouterApiKey: string },
): Promise<CompareTraceResult> {
	const apiKey = target === "ai-stats" ? keys.gatewayApiKey : keys.openRouterApiKey;
	const baseUrl =
		target === "ai-stats"
			? args.gatewayBaseUrl || DEFAULT_GATEWAY_BASE_URL
			: args.openRouterBaseUrl || DEFAULT_OPENROUTER_BASE_URL;
	const start = performance.now();
	let headersMs = 0;
	let firstByteMs: number | null = null;
	let firstFrameMs: number | null = null;
	let firstJsonFrameMs: number | null = null;
	let firstContentMs: number | null = null;
	let firstUsageMs: number | null = null;
	let doneMs: number | null = null;
	let totalMs = 0;
	let bodyBytes = 0;
	let chunkCount = 0;
	let frameCount = 0;
	let contentFrameCount = 0;
	const firstFrames: FrameTrace[] = [];
	let serverTiming: Record<string, number> | null = null;

	try {
		const response = await fetch(endpointUrl(baseUrl, args.endpoint), {
			method: "POST",
			headers: buildCompareHeaders(target, apiKey),
			body: JSON.stringify(buildCompareBody(args)),
			cache: "no-store",
		});
		headersMs = round3(performance.now() - start);
		serverTiming =
			target === "ai-stats"
				? parseServerTiming(response.headers.get("server-timing"))
				: null;

		const reader = response.body?.getReader();
		if (!reader) {
			return {
				target,
				run,
				ok: false,
				status: response.status,
				headersMs,
				firstByteMs,
				firstFrameMs,
				firstJsonFrameMs,
				firstContentMs,
				firstUsageMs,
				doneMs,
				totalMs: headersMs,
				bodyBytes,
				chunkCount,
				frameCount,
				contentFrameCount,
				firstFrames,
				serverTiming,
				gatewayStageBreakdown: buildGatewayStageBreakdown(
					serverTiming,
					headersMs,
					firstByteMs,
					firstContentMs,
				),
				error: "Missing response body",
			};
		}

		const decoder = new TextDecoder();
		let buffer = "";
		let preview = "";
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value) continue;
			const now = round3(performance.now() - start);
			if (firstByteMs === null) firstByteMs = now;
			bodyBytes += value.byteLength;
			chunkCount += 1;
			const text = decoder.decode(value, { stream: true });
			if (preview.length < 500) preview += text.slice(0, 500 - preview.length);
			buffer += text;

			const frames = buffer.split(/\n\n/);
			buffer = frames.pop() ?? "";
			for (const raw of frames) {
				const frameAt = round3(performance.now() - start);
				if (firstFrameMs === null) firstFrameMs = frameAt;
				frameCount += 1;
				const parsed = parseSseFrame(raw);
				const data = parsed.data.trim();
				if (data === "[DONE]") {
					if (doneMs === null) doneMs = frameAt;
					recordFrame(firstFrames, {
						atMs: frameAt,
						event: parsed.event,
						object: null,
						type: null,
						dataKind: "done",
						dataPreview: null,
						hasContent: false,
						contentLength: 0,
						hasUsage: false,
						isDone: true,
						rawBytesSeen: bodyBytes,
					});
					continue;
				}
				if (!data) {
					recordFrame(firstFrames, {
						atMs: frameAt,
						event: parsed.event,
						object: null,
						type: null,
						dataKind: "non-json",
						dataPreview: raw.slice(0, 80),
						hasContent: false,
						contentLength: 0,
						hasUsage: false,
						isDone: false,
						rawBytesSeen: bodyBytes,
					});
					continue;
				}
				const json = parseJsonObject(data);
				if (!json) {
					recordFrame(firstFrames, {
						atMs: frameAt,
						event: parsed.event,
						object: null,
						type: null,
						dataKind: "non-json",
						dataPreview: data.slice(0, 80),
						hasContent: false,
						contentLength: 0,
						hasUsage: false,
						isDone: false,
						rawBytesSeen: bodyBytes,
					});
					continue;
				}
				if (firstJsonFrameMs === null) firstJsonFrameMs = frameAt;
				const contentLength = contentLengthFromFrame(json);
				const hasContent = contentLength > 0;
				const hasUsage = Boolean(json?.usage || json?.response?.usage);
				if (hasContent) {
					contentFrameCount += 1;
					if (firstContentMs === null) firstContentMs = frameAt;
				}
				if (hasUsage && firstUsageMs === null) firstUsageMs = frameAt;
				recordFrame(firstFrames, {
					atMs: frameAt,
					event: parsed.event,
					object: typeof json?.object === "string" ? json.object : null,
					type: typeof json?.type === "string" ? json.type : null,
					dataKind: "json",
					dataPreview: null,
					hasContent,
					contentLength,
					hasUsage,
					isDone: false,
					rawBytesSeen: bodyBytes,
				});
			}
		}

		totalMs = round3(performance.now() - start);
		if (!response.ok) {
			return {
				target,
				run,
				ok: false,
				status: response.status,
				headersMs,
				firstByteMs,
				firstFrameMs,
				firstJsonFrameMs,
				firstContentMs,
				firstUsageMs,
				doneMs,
				totalMs,
				bodyBytes,
				chunkCount,
				frameCount,
				contentFrameCount,
				firstFrames,
				serverTiming,
				gatewayStageBreakdown: buildGatewayStageBreakdown(
					serverTiming,
					headersMs,
					firstByteMs,
					firstContentMs,
				),
				error: `HTTP ${response.status}: ${preview}`,
			};
		}

		return {
			target,
			run,
			ok: true,
			status: response.status,
			headersMs,
			firstByteMs,
			firstFrameMs,
			firstJsonFrameMs,
			firstContentMs,
			firstUsageMs,
			doneMs,
			totalMs,
			bodyBytes,
			chunkCount,
			frameCount,
			contentFrameCount,
			firstFrames,
			serverTiming,
			gatewayStageBreakdown: buildGatewayStageBreakdown(
				serverTiming,
				headersMs,
				firstByteMs,
				firstContentMs,
			),
			error: null,
		};
	} catch (error) {
		totalMs = round3(performance.now() - start);
		return {
			target,
			run,
			ok: false,
			status: 0,
			headersMs,
			firstByteMs,
			firstFrameMs,
			firstJsonFrameMs,
			firstContentMs,
			firstUsageMs,
			doneMs,
			totalMs,
			bodyBytes,
			chunkCount,
			frameCount,
			contentFrameCount,
			firstFrames,
			serverTiming: null,
			gatewayStageBreakdown: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function summarize(results: CompareTraceResult[], target: CompareTarget): CompareSummary {
	const targetResults = results.filter((result) => result.target === target);
	const successes = targetResults.filter((result) => result.ok);
	return {
		target,
		successes: successes.length,
		failures: targetResults.length - successes.length,
		headersMs: stats(successes.map((result) => result.headersMs)),
		firstByteMs: stats(successes.map((result) => result.firstByteMs)),
		firstContentMs: stats(successes.map((result) => result.firstContentMs)),
		totalMs: stats(successes.map((result) => result.totalMs)),
		stageSummary:
			target === "ai-stats"
				? {
						beforeMs: stats(successes.map((result) => result.gatewayStageBreakdown?.beforeMs ?? null)),
						protocolDetectMs: stats(successes.map((result) => result.gatewayStageBreakdown?.protocolDetectMs ?? null)),
						irDecodeMs: stats(successes.map((result) => result.gatewayStageBreakdown?.irDecodeMs ?? null)),
						executeGuardCandidatesMs: stats(successes.map((result) => result.gatewayStageBreakdown?.executeGuardCandidatesMs ?? null)),
						executeFilterModalitiesMs: stats(successes.map((result) => result.gatewayStageBreakdown?.executeFilterModalitiesMs ?? null)),
						executeRankProvidersMs: stats(successes.map((result) => result.gatewayStageBreakdown?.executeRankProvidersMs ?? null)),
						attemptBreakerMs: stats(successes.map((result) => result.gatewayStageBreakdown?.attemptBreakerMs ?? null)),
						attemptLoadPricecardMs: stats(successes.map((result) => result.gatewayStageBreakdown?.attemptLoadPricecardMs ?? null)),
						attemptResolveExecutorMs: stats(successes.map((result) => result.gatewayStageBreakdown?.attemptResolveExecutorMs ?? null)),
						attemptNormalizeIrMs: stats(successes.map((result) => result.gatewayStageBreakdown?.attemptNormalizeIrMs ?? null)),
						attemptRequestBuildMs: stats(successes.map((result) => result.gatewayStageBreakdown?.attemptRequestBuildMs ?? null)),
						attemptUpstreamHeadersMs: stats(successes.map((result) => result.gatewayStageBreakdown?.attemptUpstreamHeadersMs ?? null)),
						headersToFirstByteMs: stats(successes.map((result) => result.gatewayStageBreakdown?.headersToFirstByteMs ?? null)),
						headersToFirstContentMs: stats(successes.map((result) => result.gatewayStageBreakdown?.headersToFirstContentMs ?? null)),
						accountedHeadersMs: stats(successes.map((result) => result.gatewayStageBreakdown?.accountedHeadersMs ?? null)),
						unaccountedHeadersMs: stats(successes.map((result) => result.gatewayStageBreakdown?.unaccountedHeadersMs ?? null)),
					}
				: null,
	};
}

export async function runGatewayCompare(args: CompareArgs) {
	const gatewayApiKey = process.env.AI_STATS_PERFORMANCE_TEST_KEY ?? "";
	const openRouterApiKey =
		process.env.PERFORMANCE_KEY_OPENROUTER ??
		process.env.OPENROUTER_API_KEY ??
		"";
	if (!gatewayApiKey || !openRouterApiKey) {
		throw new Error(
			"Missing AI_STATS_PERFORMANCE_TEST_KEY or PERFORMANCE_KEY_OPENROUTER in server environment.",
		);
	}

	const results: CompareTraceResult[] = [];
	for (let run = 1; run <= args.runs; run += 1) {
		const [aiStats, openrouter] = await Promise.all([
			traceOne("ai-stats", run, args, { gatewayApiKey, openRouterApiKey }),
			traceOne("openrouter", run, args, { gatewayApiKey, openRouterApiKey }),
		]);
		results.push(aiStats, openrouter);
	}

	return {
		config: {
			model: args.model,
			prompt: args.prompt,
			runs: args.runs,
			maxCompletionTokens: args.maxCompletionTokens,
			endpoint: args.endpoint,
			gatewayBaseUrl: args.gatewayBaseUrl || DEFAULT_GATEWAY_BASE_URL,
			openRouterBaseUrl: args.openRouterBaseUrl || DEFAULT_OPENROUTER_BASE_URL,
		},
		results,
		summaries: [
			summarize(results, "ai-stats"),
			summarize(results, "openrouter"),
		],
	};
}
