"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Clock3, Database, GitBranch, MessageSquareText, Route, Server, Wrench, type LucideIcon } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import { DetailTimingBar } from "./DetailDialogPrimitives";
import { RoutingTracePanel } from "./RoutingTracePanel";
import { formatWordyDateTime } from "@/lib/gateway/usage/timeFormatting";
import type { GatewayIoLog, RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";

type TraceTimingItem = {
	key: string;
	label: React.ReactNode;
	duration: number | null;
	colorClass: string;
};

type TraceMessage = {
	key: string;
	role: string;
	text: string;
	toolCallId?: string | null;
	toolCalls?: TraceToolCall[];
};

type TraceToolCall = {
	key: string;
	id: string | null;
	name: string;
	arguments: unknown;
};

type TraceToolResult = {
	key: string;
	id: string | null;
	name: string | null;
	output: unknown;
	isError: boolean;
};

type TraceServerToolCall = TraceToolCall & {
	output: unknown;
	isError: boolean;
};

type TraceServerToolRound = {
	key: string;
	round: number;
	durationMs: number | null;
	calls: TraceServerToolCall[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringify(value: unknown): string {
	if (typeof value === "string") {
		try {
			return JSON.stringify(JSON.parse(value), null, 2);
		} catch {
			return value;
		}
	}
	if (value == null) return "";
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return String(value);
	}
}

function readText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value.map((part) => {
			if (typeof part === "string") return part;
			const record = asRecord(part);
			if (!record) return "";
			if (typeof record.text === "string") return record.text;
			if (typeof record.output_text === "string") return record.output_text;
			if (typeof record.input_text === "string") return record.input_text;
			if (record.type === "tool_result" || record.type === "function_call_output") {
				return readText(record.content ?? record.output ?? record.result) || stringify(record.content ?? record.output ?? record.result);
			}
			if (record.functionResponse != null || record.function_response != null) {
				return stringify(record.functionResponse ?? record.function_response);
			}
			if (typeof record.type === "string" && record.type.includes("image")) return "[Image]";
			if (typeof record.type === "string" && record.type.includes("audio")) return "[Audio]";
			if (typeof record.type === "string" && record.type.includes("video")) return "[Video]";
			return "";
		}).filter(Boolean).join("\n");
	}
	const record = asRecord(value);
	if (!record) return "";
	if (typeof record.text === "string") return record.text;
	if (typeof record.output_text === "string") return record.output_text;
	if (typeof record.input_text === "string") return record.input_text;
	if (record.type === "tool_result" || record.type === "function_call_output") {
		return readText(record.content ?? record.output ?? record.result) || stringify(record.content ?? record.output ?? record.result);
	}
	if (record.functionResponse != null || record.function_response != null) {
		return stringify(record.functionResponse ?? record.function_response);
	}
	return "";
}

function roleLabel(value: unknown): string {
	if (typeof value !== "string" || !value.trim()) return "Message";
	const role = value.trim().toLowerCase();
	if (role === "model") return "Assistant";
	if (role === "function" || role === "tool" || role === "function_call_output" || role === "tool_result") return "Tool result";
	if (role === "function_call" || role === "tool_call") return "Assistant tool call";
	return role.charAt(0).toUpperCase() + role.slice(1);
}

function makeMessage(value: unknown, index: number): TraceMessage | null {
	const record = asRecord(value);
	if (!record) return null;
	const role = roleLabel(record.role ?? record.speaker ?? record.type);
	const content = record.content ?? record.parts ?? record.input ?? record.output;
	const text = readText(content);
	const toolCalls = asArray(record.tool_calls)
		.map((call, callIndex) => normalizeToolCall(call, callIndex))
		.filter((call): call is TraceToolCall => call !== null);
	for (const part of asArray(content)) {
		const block = asRecord(part);
		if (!block) continue;
		const embeddedCall = block.type === "tool_use" || block.type === "server_tool_use"
			? block
			: block.functionCall ?? block.function_call;
		if (embeddedCall) {
			const call = normalizeToolCall(embeddedCall, toolCalls.length);
			if (call) toolCalls.push(call);
		}
	}
	if (record.function_call) {
		const call = normalizeToolCall(record.function_call, toolCalls.length);
		if (call) toolCalls.push(call);
	}
	if (typeof record.type === "string" && (record.type.includes("function_call") || record.type.includes("tool_call"))) {
		const call = normalizeToolCall(record, toolCalls.length);
		if (call && !toolCalls.some((existing) => existing.id === call.id && existing.id !== null)) {
			toolCalls.push(call);
		}
	}
	const toolCallId = [record.tool_call_id, record.call_id, record.toolCallId, record.tool_use_id]
		.find((entry): entry is string => typeof entry === "string" && entry.length > 0) ?? null;
	if (!text && !toolCallId && toolCalls.length === 0) return null;
	return { key: `${role.toLowerCase()}-${index}`, role, text, toolCallId, toolCalls };
}

function extractInputMessages(value: unknown): TraceMessage[] {
	const record = asRecord(value);
	if (!record) return [];
	const systemInstruction = record.system ??
		asRecord(record.system_instruction)?.parts ??
		asRecord(record.systemInstruction)?.parts ??
		record.systemInstruction;
	const systemText = readText(systemInstruction);
	const systemMessages: TraceMessage[] = systemText
		? [{ key: "system-instruction", role: "System", text: systemText }]
		: [];
	const messages = asArray(record.messages ?? record.input ?? record.contents)
		.map(makeMessage)
		.filter((message): message is TraceMessage => message !== null);
	if (messages.length > 0) return [...systemMessages, ...messages];
	if (typeof record.input === "string") {
		return [...systemMessages, { key: "user-input", role: "User", text: record.input }];
	}
	if (typeof record.prompt === "string") {
		return [...systemMessages, { key: "user-prompt", role: "User", text: record.prompt }];
	}
	return systemMessages;
}

function normalizeToolCall(value: unknown, index: number): TraceToolCall | null {
	const record = asRecord(value);
	if (!record) return null;
	const fn = asRecord(record.function) ?? asRecord(record.tool);
	const name = [fn?.name, record.name, record.tool_name]
		.find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
	if (!name) return null;
	const id = [record.id, record.call_id, record.tool_call_id]
		.find((entry): entry is string => typeof entry === "string" && entry.length > 0) ?? null;
	const args = fn?.arguments ?? fn?.args ?? record.arguments ?? record.args ?? record.input ?? record.parameters ?? {};
	return { key: `${id ?? name}-${index}`, id, name, arguments: args };
}

function normalizeToolResult(value: unknown, index: number): TraceToolResult | null {
	const record = asRecord(value);
	if (!record) return null;
	const id = [record.call_id, record.tool_call_id, record.tool_use_id, record.id]
		.find((entry): entry is string => typeof entry === "string" && entry.length > 0) ?? null;
	const name = [record.name, record.tool_name]
		.find((entry): entry is string => typeof entry === "string" && entry.length > 0) ?? null;
	const output = record.output ?? record.content ?? record.result ?? record.response ?? record.server_tool_result;
	if (output === undefined && record.server_tool_result === undefined) return null;
	const result = asRecord(record.server_tool_result);
	return {
		key: `${id ?? name ?? "tool-result"}-${index}`,
		id,
		name,
		output: result?.output ?? output,
		isError: record.is_error === true || record.isError === true || result?.is_error === true,
	};
}

function extractToolResults(value: unknown): TraceToolResult[] {
	const record = asRecord(value);
	if (!record) return [];
	const results: TraceToolResult[] = [];
	for (const item of asArray(record.output)) {
		const entry = asRecord(item);
		if (!entry) continue;
		const type = typeof entry.type === "string" ? entry.type : "";
		if (type.includes("function_call_output") || type === "tool_result" || entry.server_tool_result != null) {
			const result = normalizeToolResult(entry, results.length);
			if (result) results.push(result);
		}
		for (const part of asArray(entry.content)) {
			const block = asRecord(part);
			if (block && (block.type === "tool_result" || block.server_tool_result != null)) {
				const result = normalizeToolResult(block, results.length);
				if (result) results.push(result);
			}
		}
	}
	for (const block of asArray(record.content)) {
		const item = asRecord(block);
		if (item && (item.type === "tool_result" || item.server_tool_result != null)) {
			const result = normalizeToolResult(item, results.length);
			if (result) results.push(result);
		}
	}
	for (const candidate of asArray(record.candidates)) {
		const content = asRecord(asRecord(candidate)?.content);
		for (const part of asArray(content?.parts)) {
			const item = asRecord(part);
			const functionResponse = item?.functionResponse ?? item?.function_response;
			if (functionResponse != null) {
				const normalized = normalizeToolResult({ name: asRecord(functionResponse)?.name, output: asRecord(functionResponse)?.response ?? functionResponse }, results.length);
				if (normalized) results.push(normalized);
			}
		}
	}
	for (const nested of [record.response, record.data, record.result]) {
		if (nested && nested !== value) results.push(...extractToolResults(nested));
	}
	return results;
}

function extractServerToolTrace(value: unknown): TraceServerToolRound[] {
	const rounds: TraceServerToolRound[] = [];
	for (const [roundIndex, roundValue] of asArray(value).entries()) {
		const round = asRecord(roundValue);
		if (!round) continue;
		const calls: TraceServerToolCall[] = [];
		for (const [callIndex, callValue] of asArray(round.calls).entries()) {
			const record = asRecord(callValue);
			const call = normalizeToolCall(callValue, callIndex);
			if (!record || !call) continue;
			const output: unknown = record.output ?? record.content ?? null;
			calls.push({
				...call,
				output,
				isError: record.is_error === true || record.isError === true,
			});
		}
		if (calls.length === 0) continue;
		rounds.push({
			key: `server-round-${round.round ?? roundIndex + 1}`,
			round: typeof round.round === "number" ? round.round : roundIndex + 1,
			durationMs: typeof round.duration_ms === "number" ? round.duration_ms : null,
			calls,
		});
	}
	return rounds;
}

function extractToolCalls(value: unknown): TraceToolCall[] {
	const record = asRecord(value);
	if (!record) return [];
	const calls: TraceToolCall[] = [];
	const choices = asArray(record.choices);
	for (const choice of choices) {
		const message = asRecord(asRecord(choice)?.message ?? asRecord(choice)?.delta);
		for (const call of asArray(message?.tool_calls)) {
			const normalized = normalizeToolCall(call, calls.length);
			if (normalized) calls.push(normalized);
		}
		if (message?.function_call) {
			const normalized = normalizeToolCall(message.function_call, calls.length);
			if (normalized) calls.push(normalized);
		}
	}
	for (const item of asArray(record.output)) {
		const entry = asRecord(item);
		if (!entry) continue;
		const type = typeof entry.type === "string" ? entry.type : "";
		if (type.includes("function_call") || type.includes("tool_call")) {
			const normalized = normalizeToolCall(entry, calls.length);
			if (normalized) calls.push(normalized);
		}
		for (const part of asArray(entry.content)) {
			const block = asRecord(part);
			if (block && (block.type === "tool_use" || block.type === "server_tool_use")) {
				const normalized = normalizeToolCall(block, calls.length);
				if (normalized) calls.push(normalized);
			}
		}
	}
	for (const block of asArray(record.content)) {
		const item = asRecord(block);
		if (item && (item.type === "tool_use" || item.type === "server_tool_use")) {
			const normalized = normalizeToolCall(item, calls.length);
			if (normalized) calls.push(normalized);
		}
	}
	for (const candidate of asArray(record.candidates)) {
		const content = asRecord(asRecord(candidate)?.content);
		for (const part of asArray(content?.parts)) {
			const item = asRecord(part);
			const call = item?.functionCall ?? item?.function_call;
			if (call) {
				const normalized = normalizeToolCall(call, calls.length);
				if (normalized) calls.push(normalized);
			}
		}
	}
	for (const nested of [record.response, record.data, record.result]) {
		if (nested && nested !== value) calls.push(...extractToolCalls(nested));
	}
	return calls;
}

function extractAssistantText(value: unknown): string {
	const record = asRecord(value);
	if (!record) return readText(value);
	if (typeof record.output_text === "string") return record.output_text;
	if (typeof record.output === "string") return record.output;
	const firstChoice = asRecord(asArray(record.choices)[0]);
	const choiceMessage = asRecord(firstChoice?.message ?? firstChoice?.delta);
	if (typeof firstChoice?.text === "string") return firstChoice.text;
	if (choiceMessage) {
		const text = readText(choiceMessage.content);
		if (text) return text;
		if (typeof choiceMessage.refusal === "string") return choiceMessage.refusal;
	}
	const outputMessages = asArray(record.output)
		.map(asRecord)
		.filter((item): item is Record<string, unknown> => item !== null)
		.filter((item) => item.type === "message" || item.role === "assistant")
		.flatMap((item) => asArray(item.content));
	const outputText = readText(outputMessages);
	if (outputText) return outputText;
	const contentText = readText(record.content);
	if (contentText) return contentText;
	for (const candidate of asArray(record.candidates)) {
		const content = asRecord(asRecord(candidate)?.content);
		const text = readText(content?.parts);
		if (text) return text;
	}
	for (const nested of [record.response, record.data, record.result]) {
		if (nested && nested !== value) {
			const text = extractAssistantText(nested);
			if (text) return text;
		}
	}
	return "";
}

function chooseResponse(payload: Record<string, unknown> | null): {
	value: unknown;
	label: string;
	text: string;
	toolCalls: TraceToolCall[];
	toolResults: TraceToolResult[];
} {
	const candidates = [
		{ value: payload?.gateway_response, label: "Gateway response" },
		{ value: payload?.provider_response, label: "Provider response" },
	].filter((candidate) => candidate.value != null);
	const parsed = candidates.map((candidate) => ({
		...candidate,
		text: extractAssistantText(candidate.value),
		toolCalls: extractToolCalls(candidate.value),
		toolResults: extractToolResults(candidate.value),
	}));
	return parsed.sort((left, right) =>
		(Number(right.text.length > 0) + Number(right.toolCalls.length > 0) + Number(right.toolResults.length > 0)) -
		(Number(left.text.length > 0) + Number(left.toolCalls.length > 0) + Number(left.toolResults.length > 0)),
	)[0] ?? { value: null, label: "Response", text: "", toolCalls: [], toolResults: [] };
}

function getInputPayload(payload: Record<string, unknown> | null): unknown {
	return payload?.request_payload ?? payload?.provider_request ?? null;
}

function RoleBadge({ role }: { role: string }) {
	return <span className="shrink-0 rounded-sm border border-border/70 bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground">{role}</span>;
}

function ToolCallBlock({ call, state }: { call: TraceToolCall; state: string }) {
	return (
		<div className="min-w-0 border-l-2 border-border bg-muted/20 px-3 py-2.5">
			<div className="flex flex-wrap items-center gap-2">
				<Wrench className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
				<code className="break-all text-xs font-semibold">{call.name}</code>
				{call.id ? <code className="break-all text-[10px] text-muted-foreground">{call.id}</code> : null}
				<span className={cn("ml-auto rounded-sm border px-2 py-1 text-[10px] font-medium", state === "Failed" ? "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300" : "border-border/70 bg-background/70 text-muted-foreground")}>{state}</span>
			</div>
			<details className="group/tool mt-2 border-t border-border/60">
				<summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2 text-[11px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					<span>Arguments</span><span className="transition-transform group-open/tool:rotate-180">⌄</span>
				</summary>
				<pre className="max-h-64 overflow-auto border-t border-border/60 py-2.5 text-xs leading-5 whitespace-pre-wrap break-words">{stringify(call.arguments) || "{}"}</pre>
			</details>
		</div>
	);
}

type StatusTone = "amber" | "emerald" | "slate" | "rose";
const lifecycleNavigation: Array<{ id: string; label: string; icon: LucideIcon }> = [
	{ id: "trace-routing", label: "Routing", icon: Route },
	{ id: "trace-providers", label: "Providers", icon: Server },
	{ id: "trace-tools", label: "Tools", icon: Wrench },
	{ id: "trace-response", label: "Response", icon: MessageSquareText },
	{ id: "trace-capture", label: "R2 log", icon: Database },
];

function LifecycleStep({ id, title, summary, icon: Icon, badge, children }: {
	id: string; title: string; summary: string; icon: LucideIcon;
	badge?: React.ReactNode; children: React.ReactNode;
}) {
	return (
		<section id={id} data-lifecycle-step={id} tabIndex={-1} className="scroll-mt-20 pb-6 last:pb-2">
			<div className="grid grid-cols-[30px_minmax(0,1fr)] gap-3.5 sm:gap-4">
				<div className="relative z-10 flex justify-center">
					<div className="flex size-7 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground">
						<Icon className="size-4" aria-hidden="true" />
					</div>
				</div>
				<div className="min-w-0">
					<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
						<div className="min-w-0">
							<h2 className="text-sm font-semibold tracking-tight">{title}</h2>
							<p className="mt-0.5 text-xs leading-5 text-muted-foreground">{summary}</p>
						</div>
						{badge ? <div className="shrink-0">{badge}</div> : null}
					</div>
					<div className="min-w-0 pt-3">{children}</div>
				</div>
			</div>
		</section>
	);
}

function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: StatusTone }) {
	const colors = tone === "emerald" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
		: tone === "amber" ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
		: tone === "rose" ? "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
		: "border-border/70 bg-background/70 text-muted-foreground";
	return <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-medium", colors)}>{children}</span>;
}

function formatTraceDuration(value: unknown): string | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
	if (value < 1000) return Math.round(value).toLocaleString() + " ms";
	const seconds = value / 1000;
	return seconds.toLocaleString(undefined, { maximumFractionDigits: seconds >= 10 ? 1 : 2 }) + " s";
}

function getAttemptStatus(attempt: Record<string, unknown>): { label: string; tone: "emerald" | "amber" | "rose" | "slate" } {
	const status = typeof attempt.status === "number" ? attempt.status : null;
	if (status !== null && status >= 200 && status < 300) return { label: String(status), tone: "emerald" };
	if (status === 429) return { label: "429", tone: "amber" };
	if (status !== null && status >= 500) return { label: String(status), tone: "rose" };
	if (status !== null && status >= 400) return { label: String(status), tone: "amber" };
	if (attempt.outcome === "success") return { label: "OK", tone: "emerald" };
	return { label: typeof attempt.outcome === "string" ? attempt.outcome : "Recorded", tone: "slate" };
}

function extractToolUsage(usage: unknown): Array<{ label: string; count: number }> {
	const record = asRecord(usage);
	if (!record) return [];
	const ext = asRecord(record._ext);
	const sources = [asRecord(record.server_tool_use), asRecord(record.serverToolUse), asRecord(ext?.serverToolUse), record]
		.filter((value): value is Record<string, unknown> => value !== null);
	const definitions: Array<[string, string, string]> = [
		["Datetime", "datetime_requests", "datetimeRequests"], ["Web search", "web_search_requests", "webSearchRequests"],
		["Web fetch", "web_fetch_requests", "webFetchRequests"], ["Advisor", "advisor_requests", "advisorRequests"],
		["Image generation", "image_generation_requests", "imageGenerationRequests"], ["Apply patch", "apply_patch_requests", "applyPatchRequests"],
		["Subagent", "subagent_requests", "subagentRequests"], ["Fusion", "fusion_requests", "fusionRequests"],
		["Model search", "search_models_requests", "searchModelsRequests"],
	];
	return definitions.flatMap(([label, snakeKey, camelKey]) => {
		const count = sources.reduce<number>((max, source) => {
			const value = Number(source[snakeKey] ?? source[camelKey] ?? 0);
			return Number.isFinite(value) ? Math.max(max, value) : max;
		}, 0);
		return count > 0 ? [{ label, count }] : [];
	});
}

function InputMessages({ messages }: { messages: TraceMessage[] }) {
	return (
		<div className="space-y-2">
			{messages.map((message) => (
				<div key={message.key} className="min-w-0 border-l-2 border-border bg-muted/20 p-3">
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<RoleBadge role={message.role} />
						{message.toolCallId ? <code className="truncate text-[10px] text-muted-foreground">{message.toolCallId}</code> : null}
					</div>
					{message.text ? <div className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</div> : message.toolCallId ? <div className="text-xs italic text-muted-foreground">Tool result has no text content.</div> : null}
					{message.toolCalls?.length ? <div className="mt-2 space-y-2">{message.toolCalls.map((call) => <ToolCallBlock key={call.key} call={call} state="In request" />)}</div> : null}
				</div>
			))}
		</div>
	);
}

function toolResultCard(result: TraceToolResult) {
	return (
		<div key={result.key} className={cn("border-l-2 bg-muted/20 px-3 py-2.5", result.isError ? "border-rose-500/60" : "border-emerald-500/60")}>
			<div className="flex items-center gap-2 text-xs font-medium">
				<Wrench className="size-3.5 text-muted-foreground" aria-hidden="true" />{result.name ?? "Tool result"}
				<StatusPill tone={result.isError ? "rose" : "emerald"}>{result.isError ? "Failed" : "Result"}</StatusPill>
			</div>
			<pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{stringify(result.output)}</pre>
		</div>
	);
}
export function GenerationTraceView({ request, ioLog, timelineItems, providerNames }: {
	request: RequestRow; ioLog?: GatewayIoLog | null; timelineItems: TraceTimingItem[]; providerNames?: Map<string, string>;
}) {
	const traceRootRef = React.useRef<HTMLDivElement>(null);
	const [activeStep, setActiveStep] = React.useState(lifecycleNavigation[0].id);
	const payload = asRecord(ioLog?.payload);
	const inputPayload = getInputPayload(payload);
	const inputMessages = extractInputMessages(inputPayload);
	const response = chooseResponse(payload);
	const serverToolRounds = extractServerToolTrace(payload?.server_tool_trace);
	const serverToolCalls = serverToolRounds.flatMap((round) => round.calls);
	const toolUsage = extractToolUsage(request.usage);
	const reportedToolCount = toolUsage.reduce((sum, entry) => sum + entry.count, 0);
	const visibleToolCallCount = serverToolCalls.length + response.toolCalls.length;
	const toolActivityCount = Math.max(reportedToolCount, visibleToolCallCount, response.toolResults.length);
	const hasToolDetails = visibleToolCallCount > 0 || response.toolResults.length > 0;
	const requestId = request.request_id;
	const rawInput = stringify(inputPayload);
	const rawProviderRequest = stringify(payload?.provider_request);
	const rawGatewayResponse = stringify(payload?.gateway_response);
	const rawProviderResponse = stringify(payload?.provider_response);
	const rawMetadata = stringify(payload?.metadata);
	const rawServerToolTrace = stringify(payload?.server_tool_trace);
	const outputCopy = response.text || stringify(response.value);
	const attempts = Array.isArray(request.provider_attempts) ? request.provider_attempts : [];
	const providerTimingItems = timelineItems
		.filter((item) => item.key !== "phaseo-routing")
		.map((item) => ({ ...item, colorClass: "bg-muted-foreground/50" }));
	const routingTiming = timelineItems.find((item) => item.key === "phaseo-routing");
	const decisions = request.routing_decisions ?? [];
	const rankedDecisions = decisions.filter((decision) => decision.decision === "ranked");
	const selectedDecision = rankedDecisions.find((decision) => decision.selected);
	const routeProvider = selectedDecision?.provider_slug ?? request.provider;
	const routeProviderName = routeProvider ? providerNames?.get(routeProvider) ?? routeProvider : "Provider unavailable";
	const routingMode = String(asRecord(request.routing_trace)?.routing_mode ?? "balanced");
	const routingSummary = selectedDecision
		? routeProviderName + " selected from " + rankedDecisions.length + " scored candidate" + (rankedDecisions.length === 1 ? "" : "s")
		: routeProvider ? routeProviderName + " selected" : "No route selection was recorded";
	const payloadTone: StatusTone = ioLog?.status === "stored" ? "emerald" : ioLog?.status ? "amber" : "slate";
	const responseTone: StatusTone = request.success ? "emerald" : "amber";

	React.useEffect(() => {
		const root = traceRootRef.current;
		if (!root || typeof IntersectionObserver === "undefined") return;
		const scrollRoot = root.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
		const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-lifecycle-step]"));
		const observer = new IntersectionObserver((entries) => {
			const visible = entries.filter((entry) => entry.isIntersecting)
				.sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
			const next = visible?.target instanceof HTMLElement ? visible.target.dataset.lifecycleStep : null;
			if (next) setActiveStep(next);
		}, { root: scrollRoot, rootMargin: "-14% 0px -70% 0px", threshold: 0 });
		steps.forEach((step) => observer.observe(step));
		return () => observer.disconnect();
	}, [requestId]);

	function jumpToStep(id: string) {
		traceRootRef.current?.querySelector<HTMLElement>('[data-lifecycle-step="' + id + '"]')
			?.scrollIntoView({ behavior: "smooth", block: "start" });
		setActiveStep(id);
	}

	return (
		<div ref={traceRootRef} className="space-y-4 pb-4">
			<div className="overflow-hidden rounded-md border border-border/70 bg-card/40 p-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex min-w-0 items-start gap-3">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground"><GitBranch className="size-4" aria-hidden="true" /></div>
						<div className="min-w-0">
							<div className="text-sm font-semibold">Request lifecycle</div>
							<div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{request.model_id ?? routeProviderName}</div>
						</div>
					</div>
					<div className="flex flex-wrap gap-1.5">
						<StatusPill tone={responseTone}>{request.success ? <CheckCircle2 className="size-3" aria-hidden="true" /> : <AlertCircle className="size-3" aria-hidden="true" />}{request.success ? "Completed" : "Failed"}</StatusPill>
						<StatusPill>{routeProviderName}</StatusPill>
						{ioLog ? <StatusPill tone={payloadTone}>R2 {ioLog.status}</StatusPill> : null}
					</div>
				</div>
				<div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-3 sm:grid-cols-4">
					<div><div className="text-[10px] font-medium text-muted-foreground">Generation</div><div className="mt-0.5 font-mono text-xs font-semibold tabular-nums">{formatTraceDuration(request.generation_ms) ?? "Not recorded"}</div></div>
					<div><div className="text-[10px] font-medium text-muted-foreground">Provider attempts</div><div className="mt-0.5 font-mono text-xs font-semibold tabular-nums">{attempts.length ? attempts.length.toLocaleString() : "Not recorded"}</div></div>
					<div><div className="text-[10px] font-medium text-muted-foreground">Tool calls</div><div className="mt-0.5 font-mono text-xs font-semibold tabular-nums">{toolActivityCount.toLocaleString()}</div></div>
					<div><div className="text-[10px] font-medium text-muted-foreground">Retained until</div><div className="mt-0.5 truncate text-xs font-semibold">{ioLog?.retention_until ? formatWordyDateTime(ioLog.retention_until) : "Not stored"}</div></div>
				</div>
			</div>

			<nav aria-label="Request lifecycle" className="sticky top-0 z-20 -mx-3 border-y border-border/70 bg-background/95 px-2 py-2 backdrop-blur-md sm:-mx-4 sm:px-3">
				<div className="grid grid-cols-5 gap-1">
					{lifecycleNavigation.map((step) => {
						const active = activeStep === step.id;
						const StepIcon = step.icon;
						return (
							<button key={step.id} type="button" onClick={() => jumpToStep(step.id)} aria-current={active ? "step" : undefined}
								className={cn("flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:gap-1.5 sm:px-2 sm:text-[11px]",
									active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
								<StepIcon className="size-3.5 shrink-0" aria-hidden="true" />
								<span className="truncate">{step.label}</span>
							</button>
						);
					})}
				</div>
			</nav>

			<div className="relative space-y-0">
				<div className="pointer-events-none absolute bottom-8 left-[14px] top-3 w-px bg-border/80" aria-hidden="true" />

				<LifecycleStep id="trace-routing" title="Routing" summary={routingSummary} icon={Route} badge={<StatusPill>{routingMode}</StatusPill>}>
					<div className="space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-border bg-muted/25 px-3 py-2.5">
							<div className="min-w-0">
								<div className="text-[11px] font-medium text-muted-foreground">Selected route</div>
								<div className="mt-1 truncate text-sm font-semibold">{routeProviderName}</div>
								{request.model_id ? <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{request.model_id}</div> : null}
							</div>
							{routingTiming?.duration != null ? <StatusPill><Clock3 className="size-3" aria-hidden="true" />{formatTraceDuration(routingTiming.duration)}</StatusPill> : <StatusPill>Routing duration not recorded</StatusPill>}
						</div>
						<RoutingTracePanel trace={request.routing_trace ?? null} decisions={decisions} providerNames={providerNames} />
						<details className="group/input border-y border-border/60">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
								<span className="min-w-0"><span className="block text-xs font-medium">Request input</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{inputMessages.length ? inputMessages.length + " messages" : "Inspect submitted payload"}</span></span>
								<span className="text-xs text-muted-foreground transition-transform group-open/input:rotate-180">⌄</span>
							</summary>
							<div className="border-t border-border/60 p-3">
								{inputMessages.length > 0 ? <InputMessages messages={inputMessages} /> : inputPayload != null ? <p className="text-xs text-muted-foreground">This request format has no readable message list. Inspect the retained request payload below.</p> : <p className="text-xs text-muted-foreground">{ioLog?.error ?? "No request payload was retained."}</p>}
							</div>
						</details>
					</div>
				</LifecycleStep>

				<LifecycleStep id="trace-providers" title="Provider attempts"
					summary={attempts.length ? attempts.length + " upstream attempt" + (attempts.length === 1 ? "" : "s") + " recorded" : "The request's upstream timing and provider response."}
					icon={Server} badge={<StatusPill>{attempts.length ? attempts.length + " attempt" + (attempts.length === 1 ? "" : "s") : "Provider timing"}</StatusPill>}>
					<div className="space-y-4">
						{attempts.length > 0 ? <div className="space-y-0">
							{attempts.map((attempt, index) => {
								const providerId = typeof attempt.provider === "string" ? attempt.provider : request.provider;
								const providerName = providerId ? providerNames?.get(providerId) ?? providerId : "Provider attempt";
								const status = getAttemptStatus(attempt as Record<string, unknown>);
								const duration = attempt.duration_ms ?? attempt.latency_ms ?? attempt.generation_ms ?? attempt.total_ms;
								const model = attempt.provider_model_slug ?? attempt.api_model_id;
								const number = index + 1;
								return (
									<div key={String(attempt.sequence ?? attempt.attempt_number ?? index)} className="border-l-2 border-border py-2.5 pl-3.5 first:pt-1 last:pb-1">
										<div className="flex flex-wrap items-start justify-between gap-2">
											<div className="min-w-0">
												<div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
													<span className="inline-flex size-5 items-center justify-center rounded-sm border border-border/70 bg-background/70 font-mono text-[10px] text-muted-foreground">{number}</span>
													<span>{providerName}</span>
												</div>
												{model ? <div className="mt-1 truncate pl-7 font-mono text-[10px] text-muted-foreground">{model}</div> : null}
											</div>
											<div className="flex items-center gap-2"><StatusPill tone={status.tone}>{status.label}</StatusPill>{formatTraceDuration(duration) ? <span className="font-mono text-[10px] text-muted-foreground">{formatTraceDuration(duration)}</span> : null}</div>
										</div>
										{attempt.fallback_attempted === true || attempt.retryable === true ? <div className="mt-2 pl-7 text-[10px] text-muted-foreground">Retry or fallback path recorded</div> : null}
									</div>
								);
							})}
						</div> : null}
						{providerTimingItems.length > 0 ? <div className="border-t border-border/60 pt-3">
							<div className="mb-3 flex items-center gap-2 text-xs font-medium"><Clock3 className="size-3.5 text-muted-foreground" aria-hidden="true" />Recorded timing</div>
							<DetailTimingBar items={providerTimingItems} />
						</div> : attempts.length === 0 ? <div className="border-l-2 border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">No provider attempt details were recorded for this request.</div> : null}
					</div>
				</LifecycleStep>
				<LifecycleStep id="trace-tools" title="Tool activity"
					summary={toolActivityCount > 0 ? toolActivityCount + " tool request" + (toolActivityCount === 1 ? "" : "s") + " recorded" : "Gateway and provider tool calls, when present."}
					icon={Wrench} badge={<StatusPill>{toolActivityCount > 0 ? toolActivityCount + " call" + (toolActivityCount === 1 ? "" : "s") : "No calls recorded"}</StatusPill>}>
					<div className="space-y-3">
						{toolUsage.length > 0 ? <div className="flex flex-wrap gap-1.5">{toolUsage.map((entry) => <StatusPill key={entry.label}>{entry.count.toLocaleString()} {entry.label.toLowerCase()}</StatusPill>)}</div> : null}
						{serverToolRounds.map((round) => (
							<div key={round.key} className="border-l-2 border-border pl-3.5">
								<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
									<div className="flex items-center gap-2 text-xs font-semibold"><span className="inline-flex size-5 items-center justify-center rounded-sm border border-border/70 bg-background/70 font-mono text-[10px] text-muted-foreground">{round.round}</span>Gateway tool round</div>
									{round.durationMs !== null ? <StatusPill><Clock3 className="size-3" aria-hidden="true" />{formatTraceDuration(round.durationMs)}</StatusPill> : null}
								</div>
								<div className="space-y-3">{round.calls.map((call) => (
									<div key={call.key} className="space-y-2">
										<ToolCallBlock call={call} state={call.isError ? "Failed" : "Executed"} />
										<div className={cn("border-l-2 px-3 py-2.5", call.isError ? "border-rose-500/60 bg-rose-500/[0.05]" : "border-emerald-500/60 bg-emerald-500/[0.05]")}>
											<div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><CheckCircle2 className={cn("size-3.5", call.isError ? "text-rose-500" : "text-emerald-500")} aria-hidden="true" />{call.isError ? "Tool error" : "Tool result"}</div>
											<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{stringify(call.output) || (call.output == null ? "No output captured." : "")}</pre>
										</div>
									</div>
								))}</div>
							</div>
						))}
						{response.toolCalls.map((call) => {
							const result = response.toolResults.find((candidate) => call.id !== null && candidate.id === call.id);
							return <div key={call.key} className="space-y-2">
								<ToolCallBlock call={call} state={result ? result.isError ? "Failed" : "Completed" : "Requested"} />
								{result ? <div className={cn("border-l-2 px-3 py-2.5", result.isError ? "border-rose-500/60 bg-rose-500/[0.05]" : "border-emerald-500/60 bg-emerald-500/[0.05]")}><div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Execution result</div><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{stringify(result.output)}</pre></div> : <p className="pl-1 text-[11px] text-muted-foreground">No execution result was captured with this response.</p>}
							</div>;
						})}
						{response.toolResults.filter((result) => !response.toolCalls.some((call) => call.id !== null && call.id === result.id)).map(toolResultCard)}
						{!hasToolDetails && toolActivityCount > 0 ? <div role="status" className="border-l-2 border-amber-500 bg-amber-500/[0.06] px-3 py-2.5">
							<div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-200"><AlertCircle className="size-4" aria-hidden="true" />Usage recorded; call details are missing</div>
							<p className="mt-1.5 text-xs leading-5 text-muted-foreground">The request usage includes tool activity, but this stored payload has no tool arguments or results to display.</p>
						</div> : null}
						{toolActivityCount === 0 ? <div className="border-l-2 border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">No tool calls or server tool executions were recorded for this request.</div> : null}
					</div>
				</LifecycleStep>

				<LifecycleStep id="trace-response" title="Response"
					summary={response.text ? "Final response returned by the gateway." : "No final text response was captured."}
					icon={MessageSquareText} badge={<StatusPill tone={responseTone}>{request.status_code ?? (request.success ? "Complete" : "Error")}</StatusPill>}>
					<div className="border-l-2 border-border bg-muted/20 px-3.5 py-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2 text-xs font-medium"><CheckCircle2 className="size-3.5 text-muted-foreground" aria-hidden="true" />{response.label}</div>
							{outputCopy ? <CopyButton size="sm" variant="ghost" content={outputCopy} aria-label="Copy model output" /> : null}
						</div>
						<div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{response.text || (response.value == null ? ioLog?.error ?? "No response payload was retained for this request." : "This response did not include final text. Inspect the captured payload below.")}</div>
					</div>
				</LifecycleStep>

				<LifecycleStep id="trace-capture" title="Log capture"
					summary={ioLog?.status === "stored" ? "Request and response payload retained in Cloudflare R2." : "I/O payload storage status and retention details."}
					icon={Database} badge={<StatusPill tone={payloadTone}>{ioLog?.status ?? "Unavailable"}</StatusPill>}>
					<div className="space-y-3">
						<div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/60 py-3 sm:grid-cols-3">
							<div><div className="text-[10px] font-medium text-muted-foreground">Storage</div><div className="mt-1 text-xs font-semibold">{ioLog?.storage_provider === "cloudflare_r2" ? "Cloudflare R2" : ioLog?.storage_provider ?? "Not recorded"}</div></div>
							<div><div className="text-[10px] font-medium text-muted-foreground">Payload size</div><div className="mt-1 font-mono text-xs font-semibold tabular-nums">{ioLog?.bytes ? ioLog.bytes.toLocaleString() + " bytes" : "Not recorded"}</div></div>
							<div><div className="text-[10px] font-medium text-muted-foreground">Retention</div><div className="mt-1 text-xs font-semibold">{ioLog?.retention_until ? formatWordyDateTime(ioLog.retention_until) : "Not recorded"}</div></div>
						</div>
						{ioLog?.error ? <p className="rounded-md border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-800 dark:text-amber-200">{ioLog.error}</p> : null}
						{payload ? <details className="group/raw rounded-md border border-border/60 bg-background/60">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span>Inspect retained payload</span><span className="text-muted-foreground transition-transform group-open/raw:rotate-180">⌄</span></summary>
							<div className="space-y-3 border-t border-border/60 p-3">
								{[
									["Request", rawInput || "No request payload"],
									["Gateway response", rawGatewayResponse || "No gateway response"],
									["Provider request", rawProviderRequest || "Provider payload not retained"],
									["Provider response", rawProviderResponse || "Provider payload not retained"],
									["Tool execution trace", rawServerToolTrace || "No server tool executions were captured"],
									["Metadata", rawMetadata || "No metadata"],
								].map(([label, content]) => (
									<div key={label} className="min-w-0">
										<div className="mb-1.5 flex items-center justify-between gap-2">
											<h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
											{content && !content.startsWith("No ") && !content.startsWith("Provider payload") ? <CopyButton size="sm" variant="ghost" content={content} aria-label={"Copy " + label.toLowerCase()} /> : null}
										</div>
										<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/30 p-3 text-[11px] leading-5">{content}</pre>
									</div>
								))}
							</div>
						</details> : <div className="rounded-md border border-dashed border-border/70 p-4 text-xs text-muted-foreground">{ioLog?.error ?? "No retained I/O payload is available for this request."}</div>}
					</div>
				</LifecycleStep>
			</div>
		</div>
	);
}
