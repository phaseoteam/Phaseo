import {
	expandGenericWebhookEvents,
	getWebhookEventsForUpdate,
	WEBHOOK_EVENT_OPTIONS,
} from "@/components/(gateway)/settings/webhooks/webhook-events";

describe("webhook event settings", () => {
	it("omits untouched event changes when editing an endpoint", () => {
		expect(getWebhookEventsForUpdate("edit", ["batch.completed"], false)).toBeUndefined();
	});

	it("persists events for creates and explicit event edits", () => {
		expect(getWebhookEventsForUpdate("create", ["batch.completed"], false)).toEqual(["batch.completed"]);
		expect(getWebhookEventsForUpdate("edit", ["video.completed"], true)).toEqual(["video.completed"]);
	});

	it("expands generic subscriptions into independent batch and video selections", () => {
		expect(expandGenericWebhookEvents(["job.completed", "batch.failed"])).toEqual([
			"batch.completed", "video.completed", "batch.failed",
		]);
	});

	it("offers every lifecycle phase separately for batch and video", () => {
		expect(WEBHOOK_EVENT_OPTIONS).toHaveLength(14);
	});
});
