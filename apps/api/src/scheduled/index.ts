// src/scheduled/index.ts
// Purpose: Scheduled event handlers.
// Why: Keep cron logic out of the main app routing entrypoint.
// How: Runs one deterministic model discovery shard per cron invocation.

import type { GatewayBindings } from "@/runtime/env";
import { clearRuntime, configureRuntime, getSupabaseAdmin } from "@/runtime/env";
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

const MODEL_DISCOVERY_TICKS_PER_DAY = Array.from({ length: 24 }, (_value, hour) =>
	60 / getModelDiscoveryStepMinutesUtc(hour),
).reduce((total, ticks) => total + ticks, 0);

function serializeError(error: unknown): Record<string, unknown> {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			cause:
				error.cause instanceof Error
					? serializeError(error.cause)
					: error.cause ?? undefined,
		};
	}

	if (typeof error === "object" && error !== null) {
		return {
			value: error,
		};
	}

	return {
		value: error,
	};
}

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

function getScheduledMinuteUtc(event: ScheduledController): number {
	return new Date(event.scheduledTime).getUTCMinutes();
}

function getModelDiscoveryStepMinutesUtc(hour: number): number {
	if (hour >= 15 && hour < 18) {
		return 3;
	}

	if (hour >= 10 && hour < 12) {
		return 5;
	}

	return 15;
}

function isCoreJobsTick(event: ScheduledController): boolean {
	return getScheduledMinuteUtc(event) % 5 === 0;
}

function isModelDiscoveryTick(event: ScheduledController): boolean {
	const scheduledAt = new Date(event.scheduledTime);
	const hour = scheduledAt.getUTCHours();
	const minute = scheduledAt.getUTCMinutes();
	return minute % getModelDiscoveryStepMinutesUtc(hour) === 0;
}

function getModelDiscoveryExecutionIndex(event: ScheduledController): number {
	const scheduledAt = new Date(event.scheduledTime);
	const hour = scheduledAt.getUTCHours();
	const minute = scheduledAt.getUTCMinutes();
	const dayNumber = Math.floor(event.scheduledTime / (24 * 60 * 60 * 1000));

	let ticksBeforeHour = 0;
	for (let currentHour = 0; currentHour < hour; currentHour += 1) {
		ticksBeforeHour += 60 / getModelDiscoveryStepMinutesUtc(currentHour);
	}

	return (
		dayNumber * MODEL_DISCOVERY_TICKS_PER_DAY +
		ticksBeforeHour +
		Math.floor(minute / getModelDiscoveryStepMinutesUtc(hour))
	);
}

async function handleModelDiscoveryScheduledEvent(event: ScheduledController, env: GatewayBindings): Promise<void> {
	const shardSize = normalizeModelDiscoveryShardSize(
		toInt(env.MODEL_DISCOVERY_SHARD_SIZE, DEFAULT_MODEL_DISCOVERY_SHARD_SIZE),
	);
	const shardCount = getModelDiscoveryShardCount(shardSize);
	const executionIndex = getModelDiscoveryExecutionIndex(event);
	const shardIndex = executionIndex % shardCount;

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

async function handleOAuthCleanupScheduledEvent(env: GatewayBindings): Promise<void> {
	configureRuntime(env);
	try {
		const { error } = await getSupabaseAdmin().rpc("cleanup_expired_oauth_artifacts");
		if (error) throw new Error(error.message || "Failed to clean up expired OAuth artifacts");
	} finally {
		clearRuntime();
	}
}

export async function handleScheduledEvent(event: ScheduledController, env: GatewayBindings): Promise<void> {
	if (isCoreJobsTick(event)) {
		try {
			await handleOAuthCleanupScheduledEvent(env);
		} catch (error) {
			console.error("oauth_cleanup_scheduled_failed", serializeError(error));
		}
		try {
			await handleEmailOutboxScheduledEvent(event, env);
		} catch (error) {
			console.error("email_outbox_scheduled_failed", serializeError(error));
		}
		try {
			await handleAsyncWebhookRetriesScheduledEvent(event, env);
		} catch (error) {
			console.error("async_webhook_retries_scheduled_failed", serializeError(error));
		}
		try {
			await handleVideoReconciliationScheduledEvent(event, env);
		} catch (error) {
			console.error("video_reconciliation_scheduled_failed", serializeError(error));
		}
		try {
			await handleBatchReconciliationScheduledEvent(event, env);
		} catch (error) {
			console.error("batch_reconciliation_scheduled_failed", serializeError(error));
		}
	}
	if (isModelDiscoveryTick(event)) {
		try {
			await handleModelDiscoveryScheduledEvent(event, env);
		} catch (error) {
			console.error("model_discovery_scheduled_failed", serializeError(error));
		}
	}
}
