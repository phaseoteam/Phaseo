"use client";

import { useTranslations } from "next-intl";
import { Route, Server, Wrench, MessageSquareText } from "lucide-react";

type Event = {
	sequence: number;
	elapsed_ms: number;
	timestamp_ms: number;
	type: string;
	span_id?: string;
	parent_span_id?: string;
	provider?: string;
	model?: string;
	tool_call_id?: string;
	tool_name?: string;
	call_kind?: string;
	outcome?: string;
	status?: number;
};

export function readLifecycleJournal(value: unknown): { events: Event[]; truncated: boolean } | null {
	if (!value || typeof value !== "object") return null;
	const journal = value as Record<string, unknown>;
	if (journal.version !== 1 || !Array.isArray(journal.events)) return null;
	const seen = new Set<number>();
	const events = journal.events.slice(0, 1024).filter((value): value is Event => {
		if (!value || typeof value !== "object") return false;
		const event = value as Record<string, unknown>;
		const valid = typeof event.type === "string" && Number.isSafeInteger(event.sequence) && Number(event.sequence) > 0
			&& typeof event.elapsed_ms === "number" && Number.isFinite(event.elapsed_ms) && event.elapsed_ms >= 0
			&& typeof event.timestamp_ms === "number" && Number.isFinite(event.timestamp_ms) && Math.abs(event.timestamp_ms) <= 8.64e15
			&& ["span_id", "parent_span_id", "provider", "model", "tool_call_id", "tool_name", "call_kind", "outcome"].every((key) => event[key] == null || typeof event[key] === "string")
			&& (event.status == null || typeof event.status === "number");
		if (!valid || seen.has(Number(event.sequence))) return false;
		seen.add(Number(event.sequence));
		return true;
	}).sort((left, right) => left.sequence - right.sequence);
	return events.length ? { events, truncated: journal.truncated === true || events.length !== journal.events.length || events.some((event, index) => event.sequence !== index + 1) } : null;
}

export function OrderedLifecycleEvents({ journal, toolResults, providerNames }: {
	journal: NonNullable<ReturnType<typeof readLifecycleJournal>>;
	toolResults: Map<string, { output: unknown; arguments: unknown }>;
	providerNames?: Map<string, string>;
}) {
	const t = useTranslations("SettingsUI");
	const starts = new Map(journal.events.filter((event) => event.type.endsWith(".started")).map((event) => [event.span_id, event]));
	const labels = {
		"provider.admission": t("trace.providerAdmission" as never),
		"provider.rejected": t("trace.providerRejected" as never),
		"routing.completed": t("strings.Routing" as never),
		"provider.started": t("trace.modelCall" as never),
		"provider.response": t("trace.responseHeaders" as never),
		"provider.completed": t("trace.modelCompleted" as never),
		"tool.started": t("trace.toolStarted" as never),
		"tool.completed": t("trace.toolResult" as never),
		"response.ready": t("strings.Response" as never),
	};
	return <>
		{journal.truncated ? <p role="status" className="mb-3 text-xs text-muted-foreground">{t("trace.orderIncomplete" as never)}</p> : null}
		<ol className="divide-y divide-border/60">
			{journal.events.map((event) => {
				const start = starts.get(event.span_id);
				const provider = event.provider ?? start?.provider;
				const model = event.model ?? start?.model;
				const identity = event.tool_name ?? [provider ? providerNames?.get(provider) ?? provider : null, model].filter(Boolean).join(" · ");
				const Icon = event.type.startsWith("provider.") ? Server : event.type.startsWith("tool.") ? Wrench : event.type.startsWith("routing.") ? Route : MessageSquareText;
				const result = event.type === "tool.completed" && event.span_id ? toolResults.get(event.span_id) : null;
				const label = event.type === "provider.started" && event.call_kind === "continuation" ? t("trace.modelContinuation" as never)
					: event.type === "provider.started" && event.call_kind === "retry" ? t("trace.modelRetry" as never)
						: event.type === "provider.started" && event.call_kind === "nested" ? t("trace.nestedModelCall" as never)
							: labels[event.type as keyof typeof labels] ?? event.type;
				return <li key={event.sequence} data-event-sequence={event.sequence} className="py-3">
					<div className="flex items-start gap-3">
						<span className="w-6 shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground">{event.sequence}</span>
						<Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
						<div className="min-w-0 flex-1">
							<div className="text-xs font-medium">{label}</div>
							{identity ? <div className="mt-1 break-words font-mono text-[10px] text-muted-foreground">{identity}</div> : null}
							{event.parent_span_id ? <div className="mt-1 font-mono text-[10px] text-muted-foreground">↳ {starts.get(event.parent_span_id)?.tool_name ?? event.parent_span_id}</div> : null}
						</div>
						{event.status != null ? <span className="font-mono text-[10px]">{event.status}</span> : null}
						{event.outcome && event.outcome !== "success" ? <span className="text-[10px] text-destructive">{t("chatGaps.copyFailed" as never)}</span> : null}
						<time dateTime={new Date(event.timestamp_ms).toISOString()} title={new Date(event.timestamp_ms).toISOString()} className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">+{event.elapsed_ms} ms</time>
					</div>
					{result ? <details className="ml-12 mt-2 border-l border-border pl-3">
						<summary className="cursor-pointer text-xs text-muted-foreground">{t("trace.toolResult" as never)}</summary>
						<div className="mt-2 text-[10px] text-muted-foreground">{t("trace.arguments" as never)}</div>
						<pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{typeof result.arguments === "string" ? result.arguments : JSON.stringify(result.arguments, null, 2)}</pre>
						{result.output == null ? <p className="mt-3 text-xs text-muted-foreground">{t("trace.noExecutionResultWasCapturedWithThisResponse" as never)}</p> : <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{typeof result.output === "string" ? result.output : JSON.stringify(result.output, null, 2)}</pre>}
					</details> : null}
					{event.type === "tool.completed" && !result ? <p className="ml-12 mt-2 text-xs text-muted-foreground">{t("trace.noExecutionResultWasCapturedWithThisResponse" as never)}</p> : null}
				</li>;
			})}
		</ol>
	</>;
}
