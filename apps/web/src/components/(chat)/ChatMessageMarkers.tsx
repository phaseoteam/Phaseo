"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
	ChevronDown,
	Wrench,
} from "lucide-react";
import type { ChatThread } from "@/lib/indexeddb/chats";
import type { ChatToolCall } from "@/components/(chat)/chatPayload";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
	Marker,
	MarkerContent,
	MarkerIcon,
} from "@/components/ui/marker";
import { ScrollArea } from "@/components/ui/scroll-area";

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
	if (value === "xhigh") return "Extra high";
	if (value === "max") return "Max";
	return value.charAt(0).toUpperCase() + value.slice(1);
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
		<div className="flex flex-col items-center gap-1 px-1 py-2">
			{markers.map((marker) => {
				const Icon = marker.icon;
				return (
					<Marker
						key={`${messageId}-${marker.id}`}
						className="w-fit rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm"
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

const formatToolLabel = (toolCall: ChatToolCall) => {
	const raw = toolCall.name || toolCall.type || "tool";
	return raw
		.replace(/^ai-stats:/, "")
		.replace(/^gateway:/, "")
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (value) => value.toUpperCase()) || "Tool";
};

const parseToolDetailValue = (value: unknown): unknown => {
	if (value == null || value === "") return null;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed;
		}
	}
	return value;
};

const stringifyToolDetailValue = (value: unknown): string | null => {
	if (value == null || value === "") return null;
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
};

const isPlainToolDetailObject = (
	value: unknown,
): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasRenderableToolDetailValue = (value: unknown): boolean => {
	if (value == null) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) {
		return value.some((item) => hasRenderableToolDetailValue(item));
	}
	if (isPlainToolDetailObject(value)) {
		return Object.values(value).some((item) =>
			hasRenderableToolDetailValue(item),
		);
	}
	return true;
};

const hasToolDetailEntries = (value: unknown) =>
	isPlainToolDetailObject(value) &&
	Object.values(value).some((item) => hasRenderableToolDetailValue(item));

const isDatetimeToolCall = (toolCall: ChatToolCall) =>
	toolCall.name === "gateway_datetime" ||
	toolCall.name === "gateway:datetime" ||
	toolCall.type === "gateway:datetime";

const getTimezoneNamesFromOutput = (value: unknown): string[] => {
	if (!isPlainToolDetailObject(value)) return [];
	const rawTimezones = value.timezones;
	if (Array.isArray(rawTimezones)) {
		return rawTimezones
			.map((item) => {
				if (typeof item === "string") return item.trim();
				if (isPlainToolDetailObject(item)) {
					const timezone = item.timezone;
					return typeof timezone === "string" ? timezone.trim() : "";
				}
				return "";
			})
			.filter((timezone) => timezone.length > 0);
	}
	return typeof value.timezone === "string" && value.timezone.trim()
		? [value.timezone.trim()]
		: [];
};

const getToolInputDetail = (toolCall: ChatToolCall) => {
	const inputDetail = parseToolDetailValue(toolCall.input ?? toolCall.inputText);
	if (hasToolDetailEntries(inputDetail)) return inputDetail;
	if (!isDatetimeToolCall(toolCall)) return inputDetail;

	const timezones = getTimezoneNamesFromOutput(
		parseToolDetailValue(toolCall.output),
	);
	return timezones.length > 0 ? { timezones } : inputDetail;
};

const isPrimitiveToolDetailValue = (value: unknown) =>
	typeof value === "string" ||
	typeof value === "number" ||
	typeof value === "boolean";

const formatToolInlineValue = (value: unknown) => {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		const primitiveItems = value.every(
			(item) => item == null || isPrimitiveToolDetailValue(item),
		);
		if (primitiveItems) {
			return value
				.filter(
					(item) =>
						item != null &&
						(typeof item !== "string" || item.trim().length > 0),
				)
				.map((item) => String(item))
				.join(", ");
		}
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return stringifyToolDetailValue(value) ?? "";
};

const getStatusClassName = (status: ChatToolCall["status"]) => {
	if (status === "failed") {
		return "bg-destructive/10 text-destructive";
	}
	if (status === "completed") {
		return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
	}
	return "bg-muted text-muted-foreground";
};

function ToolDetailValue({
	value,
}: {
	value: unknown;
}) {
	const textValue = stringifyToolDetailValue(value);
	if (!textValue) return null;

	return (
		<ScrollArea
			className="max-h-32 rounded-md bg-muted/70"
			scrollBarOrientation="both"
			viewportClassName="p-0"
		>
			<pre className="min-w-max px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground">
				{textValue}
			</pre>
		</ScrollArea>
	);
}

function ToolDetailBlock({
	label,
	value,
}: {
	label: string;
	value: unknown;
}) {
	if (value == null || value === "") return null;
	const entries = isPlainToolDetailObject(value)
		? Object.entries(value).filter(([, item]) =>
				hasRenderableToolDetailValue(item),
			)
		: [];
	const canRenderRows =
		entries.length > 0 &&
		entries.length <= 6 &&
		entries.every(([, item]) => {
			if (isPrimitiveToolDetailValue(item) || Array.isArray(item)) {
				return formatToolInlineValue(item).length <= 140;
			}
			return false;
		});

	return (
		<div className="grid gap-1.5">
			<div className="text-[10px] font-normal tracking-normal text-muted-foreground">
				{label}
			</div>
			{canRenderRows ? (
				<div className="grid gap-1 text-xs">
					{entries.map(([key, item]) => (
						<div
							key={key}
							className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"
						>
							<span className="truncate font-normal text-muted-foreground">
								{key}
							</span>
							<code className="truncate rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
								{formatToolInlineValue(item)}
							</code>
						</div>
					))}
				</div>
			) : (
				<ToolDetailValue value={value} />
			)}
		</div>
	);
}

function ToolCallMarker({
	toolCall,
	messageId,
	index,
}: {
	toolCall: ChatToolCall;
	messageId: string;
	index: number;
}) {
	const [open, setOpen] = useState(false);
	const isRunning = toolCall.status === "running";
	const isFailed = toolCall.status === "failed";
	const label = formatToolLabel(toolCall);
	const inputDetail = getToolInputDetail(toolCall);
	const outputDetail = parseToolDetailValue(toolCall.output);
	const errorDetail = parseToolDetailValue(toolCall.errorText);
	const hasDetails = Boolean(inputDetail || outputDetail || errorDetail);
	const detailsId = `${messageId}-${toolCall.id || index}-tool-details`;
	const iconClassName = isFailed
		? "text-destructive"
		: isRunning
			? "text-muted-foreground"
			: "text-muted-foreground transition-colors group-hover/tool-marker:text-emerald-600 dark:group-hover/tool-marker:text-emerald-400";
	const statusLabel = isRunning
		? "Running"
		: isFailed
			? "Failure"
			: "Success";
	const statusClassName = getStatusClassName(toolCall.status);

	return (
		<div className="max-w-full">
			<Marker asChild>
				<button
					type="button"
					className={`group/tool-marker w-fit transition-colors ${
						isFailed
							? "text-destructive"
							: "text-muted-foreground hover:text-foreground"
					}`}
					aria-expanded={hasDetails ? open : undefined}
					aria-controls={hasDetails ? detailsId : undefined}
					onClick={() => {
						if (hasDetails) setOpen((value) => !value);
					}}
				>
					<MarkerIcon>
						<Wrench className={iconClassName} />
					</MarkerIcon>
					<MarkerContent className="inline-flex min-w-0 items-center gap-1.5">
						<span className="truncate">
							{isRunning ? (
								<Shimmer
									as="span"
									className="text-sm"
									duration={1.4}
								>
									{`Calling ${label}...`}
								</Shimmer>
							) : isFailed ? (
								`Tool failed: ${label}`
							) : (
								`Called ${label}`
							)}
						</span>
						{hasDetails ? (
							<ChevronDown
								className={`size-3.5 shrink-0 transition-transform ${
									open ? "rotate-180" : ""
								}`}
							/>
						) : null}
					</MarkerContent>
				</button>
			</Marker>
			{open && hasDetails ? (
				<div
					id={detailsId}
					className="mt-1.5 ml-6 grid w-[min(34rem,calc(100vw-4rem))] gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2"
				>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 truncate text-xs font-semibold text-foreground">
							{label}
						</div>
						<div
							className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClassName}`}
						>
							{statusLabel}
						</div>
					</div>
					<ToolDetailBlock
						label="Input"
						value={inputDetail}
					/>
					<ToolDetailBlock
						label="Output"
						value={outputDetail}
					/>
					<ToolDetailBlock
						label="Error"
						value={errorDetail}
					/>
				</div>
			) : null}
		</div>
	);
}

export function ChatToolCallMarkers({
	compact = false,
	toolCalls,
	messageId,
}: {
	compact?: boolean;
	toolCalls: ChatToolCall[];
	messageId: string;
}) {
	if (!toolCalls.length) return null;

	return (
		<div
			className={`not-prose flex max-w-full flex-col items-start gap-1 ${
				compact ? "mb-0" : "mb-1.5"
			}`}
		>
			{toolCalls.map((toolCall, index) => (
				<ToolCallMarker
					key={`${messageId}-${toolCall.id || index}`}
					toolCall={toolCall}
					messageId={messageId}
					index={index}
				/>
			))}
		</div>
	);
}
