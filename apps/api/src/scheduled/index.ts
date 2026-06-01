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
import { runHuggingFaceDiscovery } from "@/pipeline/model-discovery/huggingface";
import { runInternalCatalogDiscovery } from "@/pipeline/model-discovery/internal-catalog";
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

async function handleHuggingFaceDiscoveryScheduledEvent(_event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.MODEL_DISCOVERY_ENABLED, true)) {
		return;
	}

	configureRuntime(env);
	try {
		const summary = await runHuggingFaceDiscovery();
		if (summary.executed) {
			console.log("model_discovery_huggingface_completed", summary);
		}
	} finally {
		clearRuntime();
	}
}

async function handleInternalCatalogDiscoveryScheduledEvent(_event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.MODEL_DISCOVERY_ENABLED, true)) {
		return;
	}

	configureRuntime(env);
	try {
		const summary = await runInternalCatalogDiscovery();
		if (summary.executed) {
			console.log("model_discovery_internal_completed", summary);
		}
	} finally {
		clearRuntime();
	}
}

async function handleVideoReconciliationScheduledEvent(_event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.VIDEO_RECONCILIATION_ENABLED, true)) {
		return;
	}

	const limit = toInt(env.VIDEO_RECONCILIATION_LIMIT, 100);
	const concurrency = toInt(env.VIDEO_RECONCILIATION_CONCURRENCY, 4);
	configureRuntime(env);
	try {
		const summary = await runVideoReconciliationJob({ limit, concurrency });
		console.log("video_reconciliation_completed", summary);
	} finally {
		clearRuntime();
	}
}

async function handleBatchReconciliationScheduledEvent(_event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (!toBool(env.BATCH_RECONCILIATION_ENABLED, true)) {
		return;
	}

	const limit = toInt(env.BATCH_RECONCILIATION_LIMIT, 100);
	const concurrency = toInt(env.BATCH_RECONCILIATION_CONCURRENCY, 4);
	configureRuntime(env);
	try {
		const summary = await runBatchReconciliationJob({ limit, concurrency });
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
	try {
		await handleHuggingFaceDiscoveryScheduledEvent(event, env);
	} catch (error) {
		console.error("model_discovery_huggingface_scheduled_failed", { error });
	}
	try {
		await handleInternalCatalogDiscoveryScheduledEvent(event, env);
	} catch (error) {
		console.error("model_discovery_internal_scheduled_failed", { error });
	}
}
