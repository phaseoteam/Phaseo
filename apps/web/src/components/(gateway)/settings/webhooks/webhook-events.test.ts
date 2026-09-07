import {
	getWebhookEventsForUpdate,
	isKindSpecificWebhookEvent,
	normalizeWebhookEvents,
} from "./webhook-events";

describe("webhook event settings", () => {
	it("recognizes kind-specific legacy subscriptions", () => {
		expect(isKindSpecificWebhookEvent("video.completed")).toBe(true);
		expect(isKindSpecificWebhookEvent("batch.failed")).toBe(true);
		expect(isKindSpecificWebhookEvent("job.completed")).toBe(false);
	});

	it("omits untouched kind-specific event changes when editing an endpoint", () => {
		expect(getWebhookEventsForUpdate("edit", ["batch.completed"], false)).toBeUndefined();
	});

	it("persists events for creates and explicit event edits", () => {
		expect(getWebhookEventsForUpdate("create", ["job.completed"], false)).toEqual(["job.completed"]);
		expect(getWebhookEventsForUpdate("edit", ["job.completed"], true)).toEqual(["job.completed"]);
	});

	it("maps legacy event names only for the friendly picker", () => {
		expect(normalizeWebhookEvents(["video.completed", "batch.completed"])).toEqual(["job.completed"]);
	});
});
