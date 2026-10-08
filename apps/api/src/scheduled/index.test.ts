import { beforeEach, describe, expect, it, vi } from "vitest";

const clearRuntimeMock = vi.fn();
const configureRuntimeMock = vi.fn();
const runAsyncWebhookRetriesJobMock = vi.fn();
const runBatchReconciliationJobMock = vi.fn();
const runBatchProviderWebhookReplayJobMock = vi.fn();
const runVideoReconciliationJobMock = vi.fn();
const drainEmailOutboxMock = vi.fn();
const runModelDiscoveryJobMock = vi.fn();
const publicAnnouncementCheckMock = vi.fn();
const runRecordInsertMock = vi.fn();
const runRecordUpdateMock = vi.fn();
const oauthCleanupRpcMock = vi.fn();
const runGatewayIoRetentionBillingJobMock = vi.fn();
const pruneExpiredDataContributionsMock = vi.fn();
const runPaymentMethodExpiryNotificationJobMock = vi.fn();
const runNotificationDeliveryJobMock = vi.fn();
const enqueueModelDeprecationNotificationsMock = vi.fn();
const runAccountDeletionPurgeJobMock = vi.fn();
const pruneExpiredGatewayIoLogsMock = vi.fn();
const publishCatalogueRevisionMock = vi.fn();
const drainWorkspacePublicationsMock = vi.fn(async () => ({ claimed: 0, completed: 0, failed: 0 }));
vi.mock("./workspace-publications", () => ({
	drainWorkspacePublications: () => drainWorkspacePublicationsMock(),
}));
const publishCustomerRateLimitTiersMock = vi.fn();
vi.mock("@core/customer-rate-limit-tiers", () => ({
	publishCustomerRateLimitTiers: (...args: unknown[]) => publishCustomerRateLimitTiersMock(...args),
}));
vi.mock("@core/catalogue-revision", () => ({
	publishCatalogueRevision: (...args: unknown[]) => publishCatalogueRevisionMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	clearRuntime: (...args: unknown[]) => clearRuntimeMock(...args),
	configureRuntime: (...args: unknown[]) => configureRuntimeMock(...args),
	getSupabaseAdmin: () => ({
		rpc: (...args: unknown[]) => oauthCleanupRpcMock(...args),
		from: () => ({
			insert: (...args: unknown[]) => runRecordInsertMock(...args),
			update: (...args: unknown[]) => {
				runRecordUpdateMock(...args);
				return { eq: async () => ({ error: null }) };
			},
		}),
	}),
}));

vi.mock("@/pipeline/model-discovery/public-model-catalog-announcements", () => ({
	runPublicModelAnnouncementCheck: (...args: unknown[]) => publicAnnouncementCheckMock(...args),
}));

vi.mock("@/core/async-notifications", () => ({
	runAsyncWebhookRetriesJob: (...args: unknown[]) => runAsyncWebhookRetriesJobMock(...args),
}));

vi.mock("@/pipeline/batch-reconciliation", () => ({
	runBatchReconciliationJob: (...args: unknown[]) => runBatchReconciliationJobMock(...args),
}));

vi.mock("@/routes/internal/batch-webhooks.helpers", () => ({
	runBatchProviderWebhookReplayJob: (...args: unknown[]) => runBatchProviderWebhookReplayJobMock(...args),
}));

vi.mock("@/pipeline/video-reconciliation", () => ({
	runVideoReconciliationJob: (...args: unknown[]) => runVideoReconciliationJobMock(...args),
}));

vi.mock("@/pipeline/notifications/email-outbox", () => ({
	drainEmailOutbox: (...args: unknown[]) => drainEmailOutboxMock(...args),
}));

vi.mock("@/pipeline/notifications/billing-alerts", () => ({
	runPaymentMethodExpiryNotificationJob: (...args: unknown[]) =>
		runPaymentMethodExpiryNotificationJobMock(...args),
}));

vi.mock("@/pipeline/notifications/notification-delivery", () => ({
	runNotificationDeliveryJob: (...args: unknown[]) => runNotificationDeliveryJobMock(...args),
	enqueueModelDeprecationNotifications: (...args: unknown[]) => enqueueModelDeprecationNotificationsMock(...args),
}));

vi.mock("@/pipeline/model-discovery", () => ({
	DEFAULT_MODEL_DISCOVERY_SHARD_SIZE: 250,
	DEFAULT_MODEL_DISCOVERY_CONCURRENCY: 8,
	getModelDiscoveryShardCount: vi.fn(() => 4),
	normalizeModelDiscoveryConcurrency: vi.fn((value: number) => value),
	normalizeModelDiscoveryShardSize: vi.fn((value: number) => value),
	runModelDiscoveryJob: (...args: unknown[]) => runModelDiscoveryJobMock(...args),
}));

vi.mock("@/pipeline/audit/io-retention-billing", () => ({
	runGatewayIoRetentionBillingJob: (...args: unknown[]) =>
		runGatewayIoRetentionBillingJobMock(...args),
}));

vi.mock("@/pipeline/classification/data-contribution", () => ({
	pruneExpiredDataContributions: (...args: unknown[]) =>
		pruneExpiredDataContributionsMock(...args),
}));

vi.mock("@/pipeline/privacy/account-deletion", () => ({
	runAccountDeletionPurgeJob: (...args: unknown[]) => runAccountDeletionPurgeJobMock(...args),
}));

vi.mock("@/pipeline/audit/io-retention-expiry", () => ({
	pruneExpiredGatewayIoLogs: (...args: unknown[]) => pruneExpiredGatewayIoLogsMock(...args),
}));

import { handleScheduledEvent } from "./index";

function scheduledEventAt(iso: string): ScheduledController {
	return {
		scheduledTime: Date.parse(iso),
		cron: "*/5 * * * *",
		noRetry: vi.fn(),
	} as unknown as ScheduledController;
}

describe("handleScheduledEvent", () => {
	beforeEach(() => {
		publishCatalogueRevisionMock.mockReset().mockResolvedValue({ revision: "1", changed: false });
		publishCustomerRateLimitTiersMock.mockReset().mockResolvedValue({ workspaces: 0, complete: true });
		clearRuntimeMock.mockReset();
		configureRuntimeMock.mockReset();
		runAsyncWebhookRetriesJobMock.mockReset();
		runBatchReconciliationJobMock.mockReset();
		runBatchProviderWebhookReplayJobMock.mockReset();
		runVideoReconciliationJobMock.mockReset();
		drainEmailOutboxMock.mockReset();
		runModelDiscoveryJobMock.mockReset();
		publicAnnouncementCheckMock.mockReset().mockResolvedValue({ detected: 0, notified: 0, pending: 0, error: null });
		runRecordInsertMock.mockReset().mockResolvedValue({ error: null });
		runRecordUpdateMock.mockReset();
		oauthCleanupRpcMock.mockReset();
		runGatewayIoRetentionBillingJobMock.mockReset();
		pruneExpiredDataContributionsMock.mockReset();
		runPaymentMethodExpiryNotificationJobMock.mockReset();
		runNotificationDeliveryJobMock.mockReset().mockResolvedValue({ queued: 0, sent: 0, failed: 0 });
		enqueueModelDeprecationNotificationsMock.mockReset().mockResolvedValue({ workspaces: 0, enqueued: 0 });
		runAccountDeletionPurgeJobMock.mockReset().mockResolvedValue({
			claimed: 0,
			completed: 0,
			failed: 0,
			deadlineMissed: 0,
			r2ObjectsDeleted: 0,
			kvKeysDeleted: 0,
		});
		pruneExpiredGatewayIoLogsMock.mockReset().mockResolvedValue({ selected: 0, deleted: 0, failed: 0 });
		oauthCleanupRpcMock.mockResolvedValue({ error: null });
		runAsyncWebhookRetriesJobMock.mockResolvedValue({
			startedAt: "2026-06-10T00:05:00.000Z",
			finishedAt: "2026-06-10T00:05:01.000Z",
			jobsScanned: 2,
			deliveriesRetried: 1,
			deliveriesSucceeded: 1,
			deliveriesStillPending: 0,
			deliveriesFailedPermanently: 0,
		});
		runBatchReconciliationJobMock.mockResolvedValue({});
		runBatchProviderWebhookReplayJobMock.mockResolvedValue({ eventsScanned: 0, eventsProcessed: 0, eventsFailed: 0 });
		runVideoReconciliationJobMock.mockResolvedValue({});
		drainEmailOutboxMock.mockResolvedValue({ processed: 0, failed: 0 });
		runModelDiscoveryJobMock.mockResolvedValue({});
		runGatewayIoRetentionBillingJobMock.mockResolvedValue({
			processed: 0,
			charged: 0,
			grace: 0,
			suspended: 0,
			skipped: 0,
			prunedObjects: 0,
			warningsQueued: 0,
			failed: 0,
		});
		pruneExpiredDataContributionsMock.mockResolvedValue({ deleted: 0, failed: 0 });
		runPaymentMethodExpiryNotificationJobMock.mockResolvedValue({ checked: 0, enqueued: 0, failed: 0 });
	});

	it("runs async webhook retries on five-minute core job ticks by default", async () => {
		const env = {
			ENV: "prod",
			ACCOUNT_DELETION_PURGE_ENABLED: "true",
			ASYNC_WEBHOOK_RETRIES_LIMIT_PER_KIND: "37",
			ASYNC_WEBHOOK_RETRIES_MAX_DELIVERIES: "11",
		} as any;

		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:05:00.000Z"), env);

		expect(runAsyncWebhookRetriesJobMock).toHaveBeenCalledWith({
			limitPerKind: 37,
			maxDeliveries: 11,
		});
		expect(runBatchProviderWebhookReplayJobMock).toHaveBeenCalledWith({ limit: 100 });
		expect(configureRuntimeMock).toHaveBeenCalledWith(env);
		expect(clearRuntimeMock).toHaveBeenCalled();
		expect(oauthCleanupRpcMock).toHaveBeenCalledWith("cleanup_expired_oauth_artifacts");
		expect(oauthCleanupRpcMock).toHaveBeenCalledWith("process_v2_analytics_outbox", {
			p_limit: 250,
		});
		expect(runModelDiscoveryJobMock).not.toHaveBeenCalled();
		expect(pruneExpiredDataContributionsMock).toHaveBeenCalledWith(1000);
		expect(pruneExpiredGatewayIoLogsMock).toHaveBeenCalledWith({
			asOf: new Date("2026-06-10T00:05:00.000Z"),
			limit: 250,
		});
		expect(runAccountDeletionPurgeJobMock).toHaveBeenCalledTimes(1);
	});

	it("publishes customer rate-limit tiers on core ticks only when its own switch is on", async () => {
		const tick = scheduledEventAt("2026-06-10T00:05:00.000Z");
		await handleScheduledEvent(tick, { ENV: "prod", CUSTOMER_RATE_LIMIT_LADDER_ENABLED: "true" } as any);
		expect(publishCustomerRateLimitTiersMock).not.toHaveBeenCalled();
		const env = { ENV: "prod", CUSTOMER_RATE_LIMIT_TIER_PUBLISHER_ENABLED: "true", CUSTOMER_RATE_LIMIT_LADDER: "{}" } as any;
		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:06:00.000Z"), env);
		expect(publishCustomerRateLimitTiersMock).not.toHaveBeenCalled();
		// Runs with the ladder itself still disabled, so the backfill precedes enforcement.
		await handleScheduledEvent(tick, env);
		expect(publishCustomerRateLimitTiersMock).toHaveBeenCalledWith({ ladderRaw: "{}" });
		publishCustomerRateLimitTiersMock.mockRejectedValueOnce(new Error("db down"));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(handleScheduledEvent(tick, env)).resolves.toBeUndefined();
		expect(error).toHaveBeenCalledWith("customer_rate_limit_tiers_scheduled_failed", expect.anything());
		error.mockRestore();
	});

	it("does not let staging claim the shared account-deletion queue", async () => {
		await handleScheduledEvent(
			scheduledEventAt("2026-06-10T00:05:00.000Z"),
			{ ENV: "staging", ACCOUNT_DELETION_PURGE_ENABLED: "true" } as any,
		);

		expect(runAccountDeletionPurgeJobMock).not.toHaveBeenCalled();
	});

	it("fails closed when the production deletion worker is not explicitly enabled", async () => {
		await handleScheduledEvent(
			scheduledEventAt("2026-06-10T00:05:00.000Z"),
			{ ENV: "prod" } as any,
		);

		expect(runAccountDeletionPurgeJobMock).not.toHaveBeenCalled();
	});

	it("allows the v2 analytics outbox batch size to be configured", async () => {
		await handleScheduledEvent(
			scheduledEventAt("2026-06-10T00:05:00.000Z"),
			{ V2_ANALYTICS_OUTBOX_LIMIT: "900" } as any,
		);

		expect(oauthCleanupRpcMock).toHaveBeenCalledWith("process_v2_analytics_outbox", {
			p_limit: 900,
		});
	});

	it("skips async webhook retries when explicitly disabled", async () => {
		await handleScheduledEvent(
			scheduledEventAt("2026-06-10T00:05:00.000Z"),
			{
				ASYNC_WEBHOOK_RETRIES_ENABLED: "false",
				BATCH_PROVIDER_WEBHOOK_REPLAY_ENABLED: "false",
			} as any,
		);

		expect(runAsyncWebhookRetriesJobMock).not.toHaveBeenCalled();
		expect(runBatchProviderWebhookReplayJobMock).not.toHaveBeenCalled();
	});

	it("does not run core async jobs on non-core ticks", async () => {
		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:01:00.000Z"), {} as any);

		expect(runAsyncWebhookRetriesJobMock).not.toHaveBeenCalled();
		expect(runBatchReconciliationJobMock).not.toHaveBeenCalled();
		expect(runBatchProviderWebhookReplayJobMock).not.toHaveBeenCalled();
		expect(runVideoReconciliationJobMock).not.toHaveBeenCalled();
	});

	it("creates one parent run before announcement writes and finishes it", async () => {
		publicAnnouncementCheckMock.mockImplementationOnce(async ({ ensureRun }: { ensureRun: () => Promise<void> }) => {
			await ensureRun();
			await ensureRun();
			return { detected: 1, notified: 1, pending: 0, error: null };
		});

		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:01:00.000Z"), {} as any);

		expect(runRecordInsertMock).toHaveBeenCalledTimes(1);
		expect(runRecordInsertMock).toHaveBeenCalledWith(expect.objectContaining({
			trigger: "scheduled",
			source: "public_model_announcements",
			status: "running",
		}));
		expect(runRecordUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
			status: "completed",
			changes_count: 1,
		}));
	});

	it("honors the model discovery kill switch", async () => {
		await handleScheduledEvent(
			scheduledEventAt("2026-06-10T00:00:00.000Z"),
			{ MODEL_DISCOVERY_ENABLED: "false" } as any,
		);

		expect(runModelDiscoveryJobMock).not.toHaveBeenCalled();
	});

	it("can run all provider checks in one Cloudflare invocation", async () => {
		await handleScheduledEvent(
			scheduledEventAt("2026-06-10T00:00:00.000Z"),
			{
				MODEL_DISCOVERY_ENABLED: "true",
				MODEL_DISCOVERY_SHARDING_ENABLED: "false",
				MODEL_DISCOVERY_CONCURRENCY: "12",
			} as any,
		);

		expect(runModelDiscoveryJobMock).toHaveBeenCalledWith({
			trigger: "scheduled",
			source: "cloudflare_cron:all-providers",
			scheduledAtIso: "2026-06-10T00:00:00.000Z",
			shardIndex: 0,
			shardCount: 1,
			concurrency: 12,
			notify: true,
			prune: true,
		});
	});

	it("publishes the catalogue revision every minute when the context bundle is enabled", async () => {
		const env = { GATEWAY_CONTEXT_BUNDLE_ENABLED: "true" } as any;
		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:01:00.000Z"), env);
		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:02:00.000Z"), env);
		expect(publishCatalogueRevisionMock).toHaveBeenCalledTimes(2);
		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:04:00.000Z"), {} as any);
		expect(publishCatalogueRevisionMock).toHaveBeenCalledTimes(2);
	});

	it("keeps running core jobs when the catalogue revision publication fails", async () => {
		publishCatalogueRevisionMock.mockRejectedValueOnce(new Error("rpc down"));
		const env = { GATEWAY_CONTEXT_BUNDLE_ENABLED: "true" } as any;
		await expect(handleScheduledEvent(scheduledEventAt("2026-06-10T00:01:00.000Z"), env)).resolves.toBeUndefined();
		expect(clearRuntimeMock).toHaveBeenCalled();
	});

	it("runs I/O retention billing on the daily billing tick", async () => {
		const env = {
			GATEWAY_IO_RETENTION_BILLING_ENABLED: "true",
			GATEWAY_IO_RETENTION_BILLING_LIMIT: "12",
			GATEWAY_IO_RETENTION_GRACE_DAYS: "9",
			GATEWAY_IO_RETENTION_PRICE_PER_MILLION_UNITS_NANOS: "7000000000",
			GATEWAY_IO_RETENTION_PRUNE_LIMIT: "44",
		} as any;

		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:10:00.000Z"), env);

		expect(runGatewayIoRetentionBillingJobMock).toHaveBeenCalledWith({
			asOf: new Date("2026-06-10T00:10:00.000Z"),
			limit: 12,
			graceDays: 9,
			pricePerMillionUnitsNanos: 7000000000,
			pruneLimit: 44,
		});
	});

	it("checks saved payment methods for expiry once per day", async () => {
		const env = { STRIPE_SECRET_KEY: "sk_test_example" } as any;

		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:20:00.000Z"), env);

		expect(runPaymentMethodExpiryNotificationJobMock).toHaveBeenCalledTimes(1);
	});
});
