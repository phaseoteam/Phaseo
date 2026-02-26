// src/scheduled/index.ts
// Purpose: Scheduled event handlers.
// Why: Keep cron logic out of the main app routing entrypoint.
// How: Runs one deterministic model discovery shard per cron invocation.

import type { GatewayBindings } from "@/runtime/env";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import {
	DEFAULT_MODEL_DISCOVERY_SHARD_SIZE,
	getModelDiscoveryShardCount,
	normalizeModelDiscoveryShardSize,
	runModelDiscoveryJob,
} from "@/pipeline/model-discovery";

const SHARD_ROTATION_WINDOW_MS = 5 * 60 * 1000;

function toBool(value: string | undefined, fallback = false): boolean {
	if (value === undefined) return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	return ["1", "true", "yes", "on"].includes(normalized);
}

function toInt(value: string | undefined, fallback: number): number {
	const parsed = Number(value ?? "");
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(1, Math.floor(parsed));
}

async function handleModelDiscoveryScheduledEvent(event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.MODEL_DISCOVERY_ENABLED, true)) {
		return;
	}

	const shardSize = normalizeModelDiscoveryShardSize(
		toInt(env.MODEL_DISCOVERY_SHARD_SIZE, DEFAULT_MODEL_DISCOVERY_SHARD_SIZE),
	);
	const shardCount = getModelDiscoveryShardCount(shardSize);
	const bucket = Math.floor(event.scheduledTime / SHARD_ROTATION_WINDOW_MS);
	const shardIndex = bucket % shardCount;

	configureRuntime(env);
	try {
		await runModelDiscoveryJob({
			trigger: "scheduled",
			source: `cloudflare_cron:shard-${shardIndex + 1}-of-${shardCount}`,
			scheduledAtIso: new Date(event.scheduledTime).toISOString(),
			shardIndex,
			shardCount,
			notify: true,
			prune: shardIndex === 0,
		});
	} finally {
		clearRuntime();
	}
}

export async function handleScheduledEvent(event: ScheduledController, env: GatewayBindings): Promise<void> {
	await handleModelDiscoveryScheduledEvent(event, env);
}
