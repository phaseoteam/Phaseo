import { describe, expect, it } from "vitest";
import { normalizeWebhookEventList } from "./settings-webhooks";

describe("webhook event settings", () => {
	it("uses lifecycle defaults when no event list is supplied", () => {
		expect(normalizeWebhookEventList(undefined)).toEqual([
			"job.status_changed",
			"job.completed",
			"job.failed",
			"job.cancelled",
			"job.expired",
		]);
	});

	it("normalizes casing, cancelled spelling, and duplicate values", () => {
		expect(normalizeWebhookEventList(["JOB.COMPLETED", "job.canceled", "job.completed"])).toEqual([
			"job.completed",
			"job.cancelled",
		]);
	});

	it("rejects unknown events instead of silently storing them", () => {
		expect(() => normalizeWebhookEventList(["job.finished"])).toThrow(
			"Webhook events include an unsupported event",
		);
	});
});
