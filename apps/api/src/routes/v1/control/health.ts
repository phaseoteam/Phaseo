// src/routes/v1/control/health.ts
// Purpose: Control-plane route handler for health operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import type { Endpoint } from "@/core/types";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { readHealth } from "@/pipeline/execute/health";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { cacheHeaders, cacheResponse, json, withRuntime } from "@/routes/utils";

export const healthRoutes = new Hono<Env>();

healthRoutes.get("/", c => c.json({ status: 'ok' }));

const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 7;
const DEFAULT_MAX_PAIRS = 24;
const MAX_MAX_PAIRS = 100;
const DEFAULT_FETCH_LIMIT = 500;
const MAX_FETCH_LIMIT = 2000;

const ENDPOINT_ALIASES: Record<string, Endpoint> = {
	"audio.transcriptions": "audio.transcription",
	"audio.translation": "audio.translations",
	"video.generations": "video.generation",
};

const ENDPOINT_SET = new Set<Endpoint>([
	"chat.completions",
	"responses",
	"messages",
	"images.generations",
	"images.edits",
	"audio.speech",
	"audio.transcription",
	"audio.translations",
	"moderations",
	"video.generation",
	"embeddings",
	"batch",
	"ocr",
	"music.generate",
	"files.upload",
	"files.list",
	"files.retrieve",
]);

type RecentRequestRow = {
	model_id: string | null;
	endpoint: string | null;
	created_at: string | null;
};

function parsePositiveInt(
	raw: string | null,
	fallback: number,
	min: number,
	max: number,
): number {
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return fallback;
	const normalized = Math.floor(parsed);
	if (normalized < min) return min;
	if (normalized > max) return max;
	return normalized;
}

function timingSafeEqual(a: string, b: string): boolean {
	const len = Math.max(a.length, b.length);
	let diff = a.length === b.length ? 0 : 1;
	for (let i = 0; i < len; i++) {
		const ca = i < a.length ? a.charCodeAt(i) : 0;
		const cb = i < b.length ? b.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

function normalizeEndpoint(value: string | null | undefined): Endpoint | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const aliased = ENDPOINT_ALIASES[trimmed] ?? trimmed;
	if (!ENDPOINT_SET.has(aliased as Endpoint)) return null;
	return aliased as Endpoint;
}

async function handleProviderDerank(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const bindings = getBindings();
	const controlSecret = bindings.GATEWAY_CONTROL_SECRET?.trim();
	if (!controlSecret) {
		return json(
			{
				ok: false,
				error: "control_secret_missing",
				message: "GATEWAY_CONTROL_SECRET is not configured",
			},
			503,
			{ "Cache-Control": "no-store" },
		);
	}

	const providedSecret = req.headers.get("x-control-secret")?.trim() ?? "";
	if (!timingSafeEqual(providedSecret, controlSecret)) {
		return json(
			{ ok: false, error: "forbidden", message: "Invalid control secret" },
			403,
			{ "Cache-Control": "no-store" },
		);
	}

	const url = new URL(req.url);
	const providerId = decodeURIComponent(url.pathname.split("/").slice(-2, -1)[0] ?? "").trim();
	if (!providerId) {
		return json(
			{ ok: false, error: "provider_required" },
			400,
			{ "Cache-Control": "no-store" },
		);
	}

	const windowHours = parsePositiveInt(
		url.searchParams.get("window_hours"),
		DEFAULT_WINDOW_HOURS,
		1,
		MAX_WINDOW_HOURS,
	);
	const maxPairs = parsePositiveInt(
		url.searchParams.get("max_pairs"),
		DEFAULT_MAX_PAIRS,
		1,
		MAX_MAX_PAIRS,
	);
	const fetchLimit = parsePositiveInt(
		url.searchParams.get("fetch_limit"),
		DEFAULT_FETCH_LIMIT,
		50,
		MAX_FETCH_LIMIT,
	);

	const nowMs = Date.now();
	const sinceIso = new Date(nowMs - windowHours * 60 * 60 * 1000).toISOString();

	try {
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase
			.from("gateway_requests")
			.select("model_id, endpoint, created_at")
			.eq("provider", providerId)
			.gte("created_at", sinceIso)
			.order("created_at", { ascending: false })
			.limit(fetchLimit);

		if (error) {
			throw new Error(error.message || "Failed to load provider request tuples");
		}

		const rows = (data ?? []) as RecentRequestRow[];
		const seen = new Set<string>();
		const tuples: Array<{ model: string; endpoint: Endpoint; last_seen_at: string | null }> = [];

		for (const row of rows) {
			const model = row.model_id?.trim();
			const endpoint = normalizeEndpoint(row.endpoint);
			if (!model || !endpoint) continue;
			const key = `${endpoint}::${model}`;
			if (seen.has(key)) continue;
			seen.add(key);
			tuples.push({
				model,
				endpoint,
				last_seen_at: row.created_at ?? null,
			});
			if (tuples.length >= maxPairs) break;
		}

		const checks = await Promise.all(
			tuples.map(async (tuple) => {
				const snapshot = await readHealth(tuple.endpoint, providerId, tuple.model);
				const openUntil = snapshot.breaker_until_ms ?? 0;
				const isOpen = snapshot.breaker === "open" && openUntil > nowMs;
				const secondsUntilReopen =
					isOpen && openUntil > nowMs
						? Math.max(Math.ceil((openUntil - nowMs) / 1000), 0)
						: 0;

				return {
					model: tuple.model,
					endpoint: tuple.endpoint,
					last_seen_at: tuple.last_seen_at,
					breaker: snapshot.breaker,
					breaker_until_ms: openUntil,
					seconds_until_reopen: secondsUntilReopen,
					err_ewma_60s: snapshot.err_ewma_60s,
					lat_ewma_60s: snapshot.lat_ewma_60s,
					tp_ewma_60s: snapshot.tp_ewma_60s,
					current_load: snapshot.current_load,
				};
			}),
		);

		const open = checks.filter(
			(entry) =>
				entry.breaker === "open" && (entry.breaker_until_ms ?? 0) > nowMs,
		);
		const halfOpen = checks.filter((entry) => entry.breaker === "half_open");

		const response = json(
			{
				ok: true,
				provider: providerId,
				now_ms: nowMs,
				window_hours: windowHours,
				deranked: open.length > 0,
				recovering: open.length === 0 && halfOpen.length > 0,
				open_count: open.length,
				half_open_count: halfOpen.length,
				checked_pairs: checks.length,
				pairs: checks,
			},
			200,
			cacheHeaders({
				scope: `health:provider-derank:${providerId}:${windowHours}:${maxPairs}:${fetchLimit}`,
				ttlSeconds: 15,
				staleSeconds: 15,
			}),
		);

		return cacheResponse(
			req,
			response,
			{
				scope: `health:provider-derank:${providerId}:${windowHours}:${maxPairs}:${fetchLimit}`,
				ttlSeconds: 15,
				staleSeconds: 15,
			},
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" },
		);
	}
}

healthRoutes.get("/providers/:providerId/derank", withRuntime(handleProviderDerank));









