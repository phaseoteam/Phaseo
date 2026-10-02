import {
	expandGenericWebhookEvents,
	getWebhookEventLabel,
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

	it("renders translated event labels without changing subscription identifiers", () => {
		const labels = {
			batch: "Lote",
			video: "Vídeo",
			allJobs: "Todos los trabajos",
			phases: {
				created: "Creado",
				status_changed: "Cambios de estado",
				progress: "Progreso",
				completed: "Completado",
				failed: "Fallido",
				cancelled: "Cancelado",
				expired: "Caducado",
			},
		};
		expect(getWebhookEventLabel("batch.completed", labels)).toBe("Lote: Completado");
		expect(getWebhookEventLabel("video.failed", labels)).toBe("Vídeo: Fallido");
		expect(getWebhookEventLabel("job.progress", labels)).toBe("Todos los trabajos: Progreso");
		expect(getWebhookEventLabel("video.future_phase", labels)).toBe("video.future_phase");
		expect(getWebhookEventsForUpdate("create", ["batch.completed"], true)).toEqual(["batch.completed"]);
	});
});
