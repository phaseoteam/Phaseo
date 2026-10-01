import { handleScheduledEvent } from "@/scheduled";

// Scheduled-only entrypoint. Durable Objects stay owned by phaseo-gateway.
export default {
	scheduled: handleScheduledEvent,
};
