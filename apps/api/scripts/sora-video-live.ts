import fs from "node:fs/promises";
import path from "node:path";
import { resolveGatewayApiKeyFromEnv } from "../tests/helpers/gatewayKey";

type GatewayLogRecord = {
	method: "GET" | "POST";
	url: string;
	request_body?: unknown;
	status: number;
	status_text: string;
	content_type: string;
	headers: Record<string, string>;
	body_text?: string;
	body_json?: unknown;
	byte_length?: number;
};

function envFlag(name: string, defaultValue = false): boolean {
	const value = (process.env[name] ?? "").trim().toLowerCase();
	if (!value) return defaultValue;
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

function trimTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function extFromMime(mimeType: string | null | undefined): string {
	const mime = String(mimeType ?? "").toLowerCase();
	if (mime.includes("mp4")) return ".mp4";
	if (mime.includes("webm")) return ".webm";
	if (mime.includes("quicktime")) return ".mov";
	if (mime.includes("mpeg")) return ".mpeg";
	return ".bin";
}

function timestampSlug(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
	await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function gatewayCall(args: {
	baseUrl: string;
	apiKey: string;
	method: "GET" | "POST";
	route: string;
	body?: unknown;
	extraHeaders?: Record<string, string>;
}): Promise<{
	record: GatewayLogRecord;
	json: any | null;
	bytes: Buffer | null;
}> {
	const url = `${trimTrailingSlash(args.baseUrl)}${args.route.startsWith("/") ? args.route : `/${args.route}`}`;
	const headers: Record<string, string> = {
		Authorization: `Bearer ${args.apiKey}`,
		...args.extraHeaders,
	};
	const bodyText = args.body == null ? undefined : JSON.stringify(args.body);
	if (bodyText) headers["Content-Type"] = "application/json";

	const res = await fetch(url, {
		method: args.method,
		headers,
		body: bodyText,
	});

	const responseHeaders = Object.fromEntries(res.headers.entries());
	const contentType = res.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const text = await res.text();
		let json: any = null;
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			json = null;
		}
		const record: GatewayLogRecord = {
			method: args.method,
			url,
			request_body: args.body,
			status: res.status,
			status_text: res.statusText,
			content_type: contentType,
			headers: responseHeaders,
			body_text: text,
			body_json: json,
		};
		return { record, json, bytes: null };
	}

	const bytes = Buffer.from(await res.arrayBuffer());
	const record: GatewayLogRecord = {
		method: args.method,
		url,
		request_body: args.body,
		status: res.status,
		status_text: res.statusText,
		content_type: contentType,
		headers: responseHeaders,
		byte_length: bytes.length,
	};
	return { record, json: null, bytes };
}

function readVideoStatus(payload: any): string {
	return String(payload?.status ?? "").trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
	if (!envFlag("LIVE_RUN", false)) {
		throw new Error("LIVE_RUN=1 is required for sora-video-live script.");
	}

	const gatewayUrl = process.env.GATEWAY_URL?.trim() || "http://127.0.0.1:8787/v1";
	const apiKey = resolveGatewayApiKeyFromEnv(process.env);
	if (!apiKey) {
		throw new Error("Missing gateway API key: set GATEWAY_API_KEY or PLAYGROUND_* env vars.");
	}

	const model = process.env.LIVE_VIDEO_MODEL?.trim() || "openai/sora-2";
	const prompt = process.env.LIVE_VIDEO_PROMPT?.trim() || "dog running";
	const seconds = process.env.LIVE_VIDEO_SECONDS?.trim() || "4";
	const size = process.env.LIVE_VIDEO_SIZE?.trim() || "720x1280";
	const pollAttempts = Number(process.env.LIVE_VIDEO_POLL_ATTEMPTS ?? "30");
	const pollDelayMs = Number(process.env.LIVE_VIDEO_POLL_DELAY_MS ?? "5000");
	const testingMode = envFlag("LIVE_VIDEO_TESTING_MODE", true);

	const artifactRoot =
		process.env.LIVE_VIDEO_ARTIFACT_DIR?.trim() ||
		path.resolve(process.cwd(), "reports", "video-live", timestampSlug());
	await fs.mkdir(artifactRoot, { recursive: true });

	const createPayload = {
		model,
		prompt,
		seconds,
		size,
		meta: true,
		testing_mode: testingMode,
		debug: {
			enabled: true,
			return_upstream_request: true,
			return_upstream_response: true,
		},
	};

	await writeJson(path.join(artifactRoot, "01-create-request.json"), createPayload);
	const create = await gatewayCall({
		baseUrl: gatewayUrl,
		apiKey,
		method: "POST",
		route: "/videos",
		body: createPayload,
		extraHeaders: testingMode ? { "x-aistats-testing-mode": "true" } : undefined,
	});
	await writeJson(path.join(artifactRoot, "02-create-response.json"), create.record);

	if (create.record.status < 200 || create.record.status >= 300 || !create.json?.id) {
		await writeJson(path.join(artifactRoot, "99-summary.json"), {
			ok: false,
			reason: "create_failed",
			artifact_root: artifactRoot,
			create_status: create.record.status,
		});
		throw new Error(`Create failed (${create.record.status}). See ${artifactRoot}`);
	}

	const videoId = String(create.json.id);
	let finalStatus = "unknown";
	let finalPollPath: string | null = null;

	for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
		if (attempt > 1) await sleep(pollDelayMs);
		const poll = await gatewayCall({
			baseUrl: gatewayUrl,
			apiKey,
			method: "GET",
			route: `/videos/${encodeURIComponent(videoId)}`,
		});
		const pollPath = path.join(artifactRoot, `03-poll-${String(attempt).padStart(2, "0")}.json`);
		await writeJson(pollPath, poll.record);
		finalPollPath = pollPath;
		finalStatus = readVideoStatus(poll.json);
		if (finalStatus === "completed" || finalStatus === "failed" || finalStatus === "cancelled" || finalStatus === "canceled") {
			break;
		}
	}

	let contentPath: string | null = null;
	let contentStatus: number | null = null;
	if (finalStatus === "completed") {
		const content = await gatewayCall({
			baseUrl: gatewayUrl,
			apiKey,
			method: "GET",
			route: `/videos/${encodeURIComponent(videoId)}/content`,
		});
		await writeJson(path.join(artifactRoot, "04-content-response.json"), content.record);
		contentStatus = content.record.status;
		if (content.record.status >= 200 && content.record.status < 300 && content.bytes) {
			const ext = extFromMime(content.record.content_type);
			contentPath = path.join(artifactRoot, `05-video${ext}`);
			await fs.writeFile(contentPath, content.bytes);
		}
	}

	const summary = {
		ok: finalStatus === "completed" && Boolean(contentPath),
		artifact_root: artifactRoot,
		model,
		video_id: videoId,
		final_status: finalStatus,
		last_poll_log: finalPollPath,
		video_file: contentPath,
		content_status: contentStatus,
	};
	await writeJson(path.join(artifactRoot, "99-summary.json"), summary);

	console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
