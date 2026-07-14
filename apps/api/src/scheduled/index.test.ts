import { beforeEach, describe, expect, it, vi } from "vitest";

const clearRuntimeMock = vi.fn();
const configureRuntimeMock = vi.fn();
const runAsyncWebhookRetriesJobMock = vi.fn();
const runBatchReconciliationJobMock = vi.fn();
const runVideoReconciliationJobMock = vi.fn();
const drainEmailOutboxMock = vi.fn();
const runModelDiscoveryJobMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	clearRuntime: (...args: unknown[]) => clearRuntimeMock(...args),
	configureRuntime: (...args: unknown[]) => configureRuntimeMock(...args),
}));

vi.mock("@/core/async-notifications", () => ({
	runAsyncWebhookRetriesJob: (...args: unknown[]) => runAsyncWebhookRetriesJobMock(...args),
}));

vi.mock("@/pipeline/batch-reconciliation", () => ({
	runBatchReconciliationJob: (...args: unknown[]) => runBatchReconciliationJobMock(...args),
}));

vi.mock("@/pipeline/video-reconciliation", () => ({
	runVideoReconciliationJob: (...args: unknown[]) => runVideoReconciliationJobMock(...args),
}));

vi.mock("@/pipeline/notifications/email-outbox", () => ({
	drainEmailOutbox: (...args: unknown[]) => drainEmailOutboxMock(...args),
}));

vi.mock("@/pipeline/model-discovery", () => ({
	DEFAULT_MODEL_DISCOVERY_SHARD_SIZE: 250,
	getModelDiscoveryShardCount: vi.fn(() => 4),
	normalizeModelDiscoveryShardSize: vi.fn((value: number) => value),
	runModelDiscoveryJob: (...args: unknown[]) => runModelDiscoveryJobMock(...args),
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
		clearRuntimeMock.mockReset();
		configureRuntimeMock.mockReset();
		runAsyncWebhookRetriesJobMock.mockReset();
		runBatchReconciliationJobMock.mockReset();
		runVideoReconciliationJobMock.mockReset();
		drainEmailOutboxMock.mockReset();
		runModelDiscoveryJobMock.mockReset();
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
		runVideoReconciliationJobMock.mockResolvedValue({});
		drainEmailOutboxMock.mockResolvedValue({ processed: 0, failed: 0 });
		runModelDiscoveryJobMock.mockResolvedValue({});
	});

	it("runs async webhook retries on five-minute core job ticks by default", async () => {
		const env = {
			ASYNC_WEBHOOK_RETRIES_LIMIT_PER_KIND: "37",
			ASYNC_WEBHOOK_RETRIES_MAX_DELIVERIES: "11",
		} as any;

		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:05:00.000Z"), env);

		expect(runAsyncWebhookRetriesJobMock).toHaveBeenCalledWith({
			limitPerKind: 37,
			maxDeliveries: 11,
		});
		expect(configureRuntimeMock).toHaveBeenCalledWith(env);
		expect(clearRuntimeMock).toHaveBeenCalled();
		expect(runModelDiscoveryJobMock).not.toHaveBeenCalled();
	});

	it("skips async webhook retries when explicitly disabled", async () => {
		await handleScheduledEvent(
			scheduledEventAt("2026-06-10T00:05:00.000Z"),
			{
				ASYNC_WEBHOOK_RETRIES_ENABLED: "false",
			} as any,
		);

		expect(runAsyncWebhookRetriesJobMock).not.toHaveBeenCalled();
	});

	it("does not run core async jobs on non-core ticks", async () => {
		await handleScheduledEvent(scheduledEventAt("2026-06-10T00:01:00.000Z"), {} as any);

		expect(runAsyncWebhookRetriesJobMock).not.toHaveBeenCalled();
		expect(runBatchReconciliationJobMock).not.toHaveBeenCalled();
		expect(runVideoReconciliationJobMock).not.toHaveBeenCalled();
	});
});
