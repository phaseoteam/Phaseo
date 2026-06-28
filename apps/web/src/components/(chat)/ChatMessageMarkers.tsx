"use client";

import type { LucideIcon } from "lucide-react";
import type { ChatThread } from "@/lib/indexeddb/chats";
import {
	Marker,
	MarkerContent,
	MarkerIcon,
} from "@/components/ui/marker";

export type RequestContextMarker = {
	modelId: string | null;
	compareModelIds: string[];
	reasoningEnabled: boolean;
	reasoningEffort: string | null;
	webSearchEnabled: boolean;
	apiServerToolsEnabled: boolean;
	attachmentsCount: number;
};

export type ChatMessageMarker = {
	id: string;
	icon: LucideIcon;
	label: string;
};

export function getRequestContextMarker(
	meta: ChatThread["messages"][number]["meta"],
): RequestContextMarker | null {
	const context =
		meta?.request_context &&
		typeof meta.request_context === "object" &&
		!Array.isArray(meta.request_context)
			? (meta.request_context as Record<string, unknown>)
			: null;
	if (!context) return null;

	return {
		modelId:
			typeof context.model_id === "string" &&
			context.model_id.trim().length > 0
				? context.model_id.trim()
				: null,
		compareModelIds: Array.isArray(context.compare_model_ids)
			? context.compare_model_ids.filter(
					(value): value is string =>
						typeof value === "string" && value.trim().length > 0,
				)
			: [],
		reasoningEnabled: Boolean(context.reasoning_enabled),
		reasoningEffort:
			typeof context.reasoning_effort === "string" &&
			context.reasoning_effort.trim().length > 0
				? context.reasoning_effort.trim()
				: null,
		webSearchEnabled: Boolean(context.web_search_enabled),
		apiServerToolsEnabled: Boolean(context.api_server_tools_enabled),
		attachmentsCount:
			typeof context.attachments_count === "number" &&
			Number.isFinite(context.attachments_count)
				? Math.max(0, Math.round(context.attachments_count))
				: 0,
	};
}

export function getComparableModelSet(context: RequestContextMarker) {
	return [context.modelId, ...context.compareModelIds]
		.filter((value): value is string => Boolean(value))
		.sort()
		.join("|");
}

export function formatReasoningEffort(value: string | null) {
	if (!value) return "Medium";
	return value === "xhigh"
		? "Extra high"
		: value.charAt(0).toUpperCase() + value.slice(1);
}

export function ChatMessageMarkers({
	markers,
	messageId,
}: {
	markers: ChatMessageMarker[];
	messageId: string;
}) {
	if (!markers.length) return null;

	return (
		<div className="grid gap-1 px-1 py-1">
			{markers.map((marker) => {
				const Icon = marker.icon;
				return (
					<Marker
						key={`${messageId}-${marker.id}`}
						variant="separator"
						className="text-xs text-muted-foreground"
					>
						<MarkerIcon>
							<Icon className="h-3.5 w-3.5" />
						</MarkerIcon>
						<MarkerContent>{marker.label}</MarkerContent>
					</Marker>
				);
			})}
		</div>
	);
}
