import {
	dispatchAsyncWebhookEvent,
	dispatchAsyncWebhookEventInBackground,
	type AsyncNotificationPhase,
} from "@core/async-notifications";

type VideoWebhookEventType =
	| "video.created"
	| "video.progress"
	| "video.completed"
	| "video.failed"
	| "video.cancelled"
	| "video.expired";

function toPhase(eventType: VideoWebhookEventType): AsyncNotificationPhase {
	switch (eventType) {
		case "video.created":
			return "created";
		case "video.progress":
			return "progress";
		case "video.completed":
			return "completed";
		case "video.failed":
			return "failed";
		case "video.cancelled":
			return "cancelled";
		case "video.expired":
			return "expired";
	}
}

export async function dispatchVideoWebhookEvent(args: {
	workspaceId: string;
	videoId: string;
	eventType: VideoWebhookEventType;
	progress?: number | null;
	force?: boolean;
	baseUrl?: string | null;
}): Promise<boolean> {
	return dispatchAsyncWebhookEvent({
		workspaceId: args.workspaceId,
		kind: "video",
		internalId: args.videoId,
		phase: toPhase(args.eventType),
		progress: args.progress,
		force: args.force,
		baseUrl: args.baseUrl,
	});
}

export function dispatchVideoWebhookEventInBackground(args: {
	workspaceId: string;
	videoId: string;
	eventType: VideoWebhookEventType;
	progress?: number | null;
	force?: boolean;
	baseUrl?: string | null;
}) {
	dispatchAsyncWebhookEventInBackground({
		workspaceId: args.workspaceId,
		kind: "video",
		internalId: args.videoId,
		phase: toPhase(args.eventType),
		progress: args.progress,
		force: args.force,
		baseUrl: args.baseUrl,
	});
}

export function dispatchVideoProgressWebhookInBackground(args: {
	workspaceId: string;
	videoId: string;
	progress: number;
	force?: boolean;
	baseUrl?: string | null;
}) {
	dispatchVideoWebhookEventInBackground({
		...args,
		eventType: "video.progress",
	});
}
