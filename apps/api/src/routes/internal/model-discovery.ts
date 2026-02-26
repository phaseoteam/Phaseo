// Purpose: Internal-only trigger for model discovery.
// Why: Keep this operation off the public API surface and avoid subrequest overages.
// How: Verifies a high-entropy internal token and runs one provider shard per invocation.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings } from "@/runtime/env";
import {
	DEFAULT_MODEL_DISCOVERY_SHARD_SIZE,
	getModelDiscoveryProviderCount,
	getModelDiscoveryShardCount,
	normalizeModelDiscoveryShardSize,
	runModelDiscoveryJob,
} from "@/pipeline/model-discovery";
import { json, withRuntime } from "@/routes/utils";

type DiscoveryTrigger = "scheduled" | "manual";

const SHARD_ROTATION_WINDOW_MS = 5 * 60 * 1000;

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

function toBool(value: string | undefined | null, fallback = false): boolean {
	if (value === undefined || value === null) return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	return ["1", "true", "yes", "on"].includes(normalized);
}

function toInt(value: string | undefined | null, fallback: number): number {
	const parsed = Number(value ?? "");
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(1, Math.floor(parsed));
}

function parseStrictPositiveInt(value: string, label: string): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`${label} must be a positive integer`);
	}
	return parsed;
}

function normalizeTrigger(value: string | null): DiscoveryTrigger {
	return value === "scheduled" ? "scheduled" : "manual";
}

function readProvidedToken(req: Request): string {
	return req.headers.get("x-internal-token")?.trim() ?? "";
}

function parseShard(url: URL): { shardIndex: number; shardCount: number } | null {
	const shardRaw = url.searchParams.get("shard");
	const ofRaw = url.searchParams.get("of");
	if (shardRaw === null && ofRaw === null) return null;
	if (shardRaw === null || ofRaw === null) {
		throw new Error("Both shard and of query params are required");
	}

	const shard = parseStrictPositiveInt(shardRaw, "shard");
	const of = parseStrictPositiveInt(ofRaw, "of");
	if (shard < 1 || shard > of) throw new Error(`shard must be between 1 and ${of}`);
	return { shardIndex: shard - 1, shardCount: of };
}

function selectAutoShard(args: {
	shardCount: number;
	scheduledAtIso?: string;
}): { shardIndex: number; shardCount: number } {
	let seedMs = Date.now();
	if (args.scheduledAtIso) {
		const parsed = Date.parse(args.scheduledAtIso);
		if (Number.isFinite(parsed)) {
			seedMs = parsed;
		}
	}
	const bucket = Math.floor(seedMs / SHARD_ROTATION_WINDOW_MS);
	const shardIndex = bucket % args.shardCount;
	return { shardIndex, shardCount: args.shardCount };
}

async function handleRunModelDiscovery(req: Request) {
	const bindings = getBindings();
	if (!toBool(bindings.MODEL_DISCOVERY_ENABLED, true)) {
		return json(
			{ ok: false, error: "disabled", message: "Model discovery is disabled" },
			503,
			{ "Cache-Control": "no-store" },
		);
	}

	const configuredToken = bindings.MODEL_DISCOVERY_INTERNAL_TOKEN?.trim() || "";
	if (!configuredToken) {
		return json(
			{
				ok: false,
				error: "control_token_missing",
				message: "MODEL_DISCOVERY_INTERNAL_TOKEN is not configured",
			},
			503,
			{ "Cache-Control": "no-store" },
		);
	}
	if (configuredToken.length < 128) {
		return json(
			{
				ok: false,
				error: "control_token_too_short",
				message: "MODEL_DISCOVERY_INTERNAL_TOKEN must be at least 128 characters",
			},
			503,
			{ "Cache-Control": "no-store" },
		);
	}

	const providedToken = readProvidedToken(req);
	if (!timingSafeEqual(providedToken, configuredToken)) {
		return json(
			{ ok: false, error: "forbidden", message: "Invalid control token" },
			403,
			{ "Cache-Control": "no-store" },
		);
	}

	const url = new URL(req.url);
	const trigger = normalizeTrigger(url.searchParams.get("trigger"));
	const source = url.searchParams.get("source")?.trim() || (trigger === "scheduled" ? "cloudflare_cron" : "internal_api");
	const notify = toBool(url.searchParams.get("notify"), true);
	const prune = toBool(url.searchParams.get("prune"), true);
	const scheduledAtIso = url.searchParams.get("scheduledAt") ?? undefined;
	const shardSize = toInt(
		url.searchParams.get("shardSize") ?? bindings.MODEL_DISCOVERY_SHARD_SIZE,
		DEFAULT_MODEL_DISCOVERY_SHARD_SIZE,
	);
	const normalizedShardSize = normalizeModelDiscoveryShardSize(shardSize);
	const discoveredShardCount = getModelDiscoveryShardCount(normalizedShardSize);
	const providerCount = getModelDiscoveryProviderCount();

	let shard: { shardIndex: number; shardCount: number } | null = null;
	try {
		shard = parseShard(url);
	} catch (error) {
		return json(
			{
				ok: false,
				error: "invalid_shard",
				message: error instanceof Error ? error.message : String(error),
			},
			400,
			{ "Cache-Control": "no-store" },
		);
	}
	if (shard && shard.shardCount < discoveredShardCount) {
		return json(
			{
				ok: false,
				error: "invalid_shard",
				message: `Requested shard count (${shard.shardCount}) is too low for ${providerCount} providers. Use at least ${discoveredShardCount} shards (or set a smaller shardSize).`,
			},
			400,
			{ "Cache-Control": "no-store" },
		);
	}

	if (!shard && discoveredShardCount > 1) {
		shard = selectAutoShard({ shardCount: discoveredShardCount, scheduledAtIso });
	}

	const started = Date.now();
	try {
		const summary = await runModelDiscoveryJob({
			trigger,
			source,
			scheduledAtIso,
			shardIndex: shard?.shardIndex,
			shardCount: shard?.shardCount,
			notify,
			prune: shard ? prune && shard.shardIndex === 0 : prune,
		});

		const providerErrors = summary.results
			.filter((result) => result.status === "error")
			.map((result) => ({
				providerId: result.providerId,
				reason: result.reason,
			}));

		return json(
			{
				ok: true,
				durationMs: Date.now() - started,
				run: {
					id: summary.runId,
					trigger: summary.trigger,
					source: summary.source,
					startedAt: summary.startedAt,
					finishedAt: summary.finishedAt,
					providersTotal: summary.providersTotal,
					providersSuccess: summary.providersSuccess,
					providersSkipped: summary.providersSkipped,
					providersError: summary.providersError,
					changesDetected: summary.changesDetected,
					staleModelsDeleted: summary.staleModelsDeleted,
				},
				shard: shard
					? {
						index: shard.shardIndex + 1,
						of: shard.shardCount,
						autoSelected: url.searchParams.get("shard") === null,
						shardSize: normalizedShardSize,
					}
					: null,
				providerErrors,
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch (error) {
		return json(
			{
				ok: false,
				error: "run_failed",
				message: error instanceof Error ? error.message : String(error),
			},
			500,
			{ "Cache-Control": "no-store" },
		);
	}
}

export const internalModelDiscoveryRoutes = new Hono<Env>();

internalModelDiscoveryRoutes.post("/run", withRuntime(handleRunModelDiscovery));
