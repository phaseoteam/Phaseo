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
import { runAsyncWebhookRetriesJob } from "@/core/async-notifications";
import { runBatchReconciliationJob } from "@/pipeline/batch-reconciliation";
import { drainEmailOutbox } from "@/pipeline/notifications/email-outbox";
import { runVideoReconciliationJob } from "@/pipeline/video-reconciliation";

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

function toZeroBasedInt(value: string | undefined, fallback: number): number {
	const parsed = Number(value ?? "");
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.floor(parsed));
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

async function handleVideoReconciliationScheduledEvent(event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.VIDEO_RECONCILIATION_ENABLED, true)) {
		return;
	}

	const limit = toInt(env.VIDEO_RECONCILIATION_LIMIT, 1000);
	const concurrency = toInt(env.VIDEO_RECONCILIATION_CONCURRENCY, 24);
	const leaseSeconds = toInt(env.VIDEO_RECONCILIATION_LEASE_SECONDS, 180);
	const shardCount = toInt(env.VIDEO_RECONCILIATION_SHARD_COUNT, 1);
	const shardIndex = Math.min(shardCount - 1, toZeroBasedInt(env.VIDEO_RECONCILIATION_SHARD_INDEX, 0));
	configureRuntime(env);
	try {
		const summary = await runVideoReconciliationJob({
			limit,
			concurrency,
			leaseSeconds,
			shardCount,
			shardIndex,
			workerId: `scheduled:video:${event.scheduledTime}:shard-${shardIndex}-of-${shardCount}`,
		});
		console.log("video_reconciliation_completed", summary);
	} finally {
		clearRuntime();
	}
}

async function handleBatchReconciliationScheduledEvent(event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.BATCH_RECONCILIATION_ENABLED, true)) {
		return;
	}

	const limit = toInt(env.BATCH_RECONCILIATION_LIMIT, 500);
	const concurrency = toInt(env.BATCH_RECONCILIATION_CONCURRENCY, 12);
	const leaseSeconds = toInt(env.BATCH_RECONCILIATION_LEASE_SECONDS, 300);
	const shardCount = toInt(env.BATCH_RECONCILIATION_SHARD_COUNT, 1);
	const shardIndex = Math.min(shardCount - 1, toZeroBasedInt(env.BATCH_RECONCILIATION_SHARD_INDEX, 0));
	configureRuntime(env);
	try {
		const summary = await runBatchReconciliationJob({
			limit,
			concurrency,
			leaseSeconds,
			shardCount,
			shardIndex,
			workerId: `scheduled:batch:${event.scheduledTime}:shard-${shardIndex}-of-${shardCount}`,
		});
		console.log("batch_reconciliation_completed", summary);
	} finally {
		clearRuntime();
	}
}

async function handleAsyncWebhookRetriesScheduledEvent(_event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.ASYNC_WEBHOOK_RETRIES_ENABLED, true)) {
		return;
	}

	const limitPerKind = toInt(env.ASYNC_WEBHOOK_RETRIES_LIMIT_PER_KIND, 200);
	const maxDeliveries = toInt(env.ASYNC_WEBHOOK_RETRIES_MAX_DELIVERIES, 100);
	configureRuntime(env);
	try {
		const summary = await runAsyncWebhookRetriesJob({ limitPerKind, maxDeliveries });
		if (summary.deliveriesRetried > 0 || summary.deliveriesFailedPermanently > 0) {
			console.log("async_webhook_retries_completed", summary);
		}
	} finally {
		clearRuntime();
	}
}

async function handleEmailOutboxScheduledEvent(_event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.EMAIL_OUTBOX_DRAIN_ENABLED, true)) {
		return;
	}
	if (!env.RESEND_API_KEY?.trim()) {
		return;
	}

	const limit = toInt(env.EMAIL_OUTBOX_DRAIN_LIMIT, 25);
	configureRuntime(env);
	try {
		const summary = await drainEmailOutbox(limit);
		if (summary.processed > 0 || summary.failed > 0) {
			console.log("email_outbox_drain_completed", summary);
		}
	} finally {
		clearRuntime();
	}
}

export async function handleScheduledEvent(event: ScheduledController, env: GatewayBindings): Promise<void> {
	try {
		await handleEmailOutboxScheduledEvent(event, env);
	} catch (error) {
		console.error("email_outbox_scheduled_failed", { error });
	}
	try {
		await handleAsyncWebhookRetriesScheduledEvent(event, env);
	} catch (error) {
		console.error("async_webhook_retries_scheduled_failed", { error });
	}
	try {
		await handleVideoReconciliationScheduledEvent(event, env);
	} catch (error) {
		console.error("video_reconciliation_scheduled_failed", { error });
	}
	try {
		await handleBatchReconciliationScheduledEvent(event, env);
	} catch (error) {
		console.error("batch_reconciliation_scheduled_failed", { error });
	}
	try {
		await handleModelDiscoveryScheduledEvent(event, env);
	} catch (error) {
		console.error("model_discovery_scheduled_failed", { error });
	}
}
