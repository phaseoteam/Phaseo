import { describe, expect, it } from "vitest";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

type JsonRecord = Record<string, unknown>;

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const LIVE_VIDEO_E2E_RUN = (process.env.LIVE_VIDEO_E2E_RUN ?? "").trim() === "1";
const describeLive = LIVE_RUN && LIVE_VIDEO_E2E_RUN ? describe : describe.skip;

const POLL_ATTEMPTS = Number(process.env.LIVE_VIDEO_E2E_POLL_ATTEMPTS ?? "8");
const POLL_DELAY_MS = Number(process.env.LIVE_VIDEO_E2E_POLL_DELAY_MS ?? "5000");

const SORA_MODEL = process.env.LIVE_VIDEO_E2E_MODEL_SORA ?? "openai/sora-2";
const MINIMAX_MODEL = process.env.LIVE_VIDEO_E2E_MODEL_MINIMAX ?? "minimax/hailuo-02";

function resolveGatewayUrl(pathname: string): string {
	const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
	const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return `${base}${suffix}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function authHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${GATEWAY_API_KEY}`,
		"Content-Type": "application/json",
	};
}

function normalizeVideoStatus(value: unknown): string {
	return String(value ?? "").trim().toLowerCase();
}

async function postJson(pathname: string, payload: JsonRecord): Promise<{ status: number; json: any }> {
	const res = await fetch(resolveGatewayUrl(pathname), {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify(payload),
	});
	const json = await res.json().catch(() => null);
	return { status: res.status, json };
}

async function getJson(pathname: string): Promise<{ status: number; json: any }> {
	const res = await fetch(resolveGatewayUrl(pathname), {
		method: "GET",
		headers: {
			Authorization: `Bearer ${GATEWAY_API_KEY}`,
		},
	});
	const json = await res.json().catch(() => null);
	return { status: res.status, json };
}

async function runVideoFlow(args: {
	payload: JsonRecord;
}): Promise<void> {
	const create = await postJson("/videos", args.payload);
	expect(create.status).toBeGreaterThanOrEqual(200);
	expect(create.status).toBeLessThan(300);
	expect(typeof create.json?.id).toBe("string");

	const videoId = String(create.json.id);
	let lastStatus = normalizeVideoStatus(create.json?.status);

	for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
		if (attempt > 1) await sleep(POLL_DELAY_MS);
		const statusRes = await getJson(`/videos/${encodeURIComponent(videoId)}`);
		expect(statusRes.status).toBeGreaterThanOrEqual(200);
		expect(statusRes.status).toBeLessThan(300);
		lastStatus = normalizeVideoStatus(statusRes.json?.status);
		if (lastStatus === "completed" || lastStatus === "failed") break;
	}

	expect(["queued", "in_progress", "completed", "failed"]).toContain(lastStatus);

	if (lastStatus === "completed") {
		const contentRes = await fetch(resolveGatewayUrl(`/videos/${encodeURIComponent(videoId)}/content`), {
			method: "GET",
			headers: {
				Authorization: `Bearer ${GATEWAY_API_KEY}`,
			},
		});
		expect(contentRes.status).toBeGreaterThanOrEqual(200);
		expect(contentRes.status).toBeLessThan(300);
	}
}

describeLive("Live video E2E (low-cost model params)", () => {
	it("OpenAI Sora 2 cheapest profile", async () => {
		await runVideoFlow({
			payload: {
				model: SORA_MODEL,
				prompt: "A simple gray sphere slowly rotating on a plain white background.",
				seconds: 4,
				resolution: "720x1280",
				quality: "standard",
				provider: { only: ["openai"] },
				meta: true,
				debug: {
					enabled: true,
					return_upstream_request: true,
					return_upstream_response: true,
				},
			},
		});
	}, 420_000);

	it("MiniMax Hailuo 02 cheapest profile", async () => {
		await runVideoFlow({
			payload: {
				model: MINIMAX_MODEL,
				prompt: "A static shot of a blue cube on a white floor with soft lighting.",
				duration_seconds: 6,
				resolution: "512p",
				provider: { only: ["minimax"] },
				meta: true,
				debug: {
					enabled: true,
					return_upstream_request: true,
					return_upstream_response: true,
				},
			},
		});
	}, 420_000);
});
