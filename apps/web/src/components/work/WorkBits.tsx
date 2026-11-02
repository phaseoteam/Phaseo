"use client";

import { useState } from "react";
import {
	Bot,
	Bug,
	Check,
	Circle,
	CircleCheck,
	CircleDashed,
	CircleDot,
	CircleX,
	Copy,
	GitBranch,
	GitPullRequestArrow,
	Hash,
	Inbox,
	MessageSquare,
	Minus,
	OctagonAlert,
	PenLine,
	Radio,
	SignalHigh,
	SignalLow,
	SignalMedium,
	Sparkles,
	type LucideIcon,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkAgent, WorkItemSource, WorkItemState, WorkMember } from "@/lib/work/types";

const PRIORITY_KEYS = ["none", "urgent", "high", "medium", "low"] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export function priorityKey(priority: number): PriorityKey {
	return PRIORITY_KEYS[priority] ?? "none";
}

const PRIORITY_ICONS: Record<PriorityKey, { icon: LucideIcon; className: string }> = {
	none: { icon: Minus, className: "text-muted-foreground/60" },
	urgent: { icon: OctagonAlert, className: "text-orange-600 dark:text-orange-400" },
	high: { icon: SignalHigh, className: "text-foreground" },
	medium: { icon: SignalMedium, className: "text-foreground/80" },
	low: { icon: SignalLow, className: "text-muted-foreground" },
};

const STATE_ICONS: Record<WorkItemState, { icon: LucideIcon; className: string }> = {
	triage: { icon: Inbox, className: "text-sky-600 dark:text-sky-400" },
	backlog: { icon: CircleDashed, className: "text-muted-foreground" },
	todo: { icon: Circle, className: "text-foreground/70" },
	in_progress: { icon: CircleDot, className: "text-amber-600 dark:text-amber-400" },
	in_review: { icon: GitPullRequestArrow, className: "text-violet-600 dark:text-violet-400" },
	done: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
	cancelled: { icon: CircleX, className: "text-muted-foreground" },
};

const SOURCE_ICONS: Record<WorkItemSource, LucideIcon> = {
	manual: PenLine,
	ask: MessageSquare,
	error: Bug,
	github: GitBranch,
	slack: Hash,
	gateway: Radio,
	agent: Sparkles,
};

/** Translated names for the work tracker's enums. */
export function useWorkCopy() {
	const tStates = useTranslations("Work.states");
	const tPriorities = useTranslations("Work.priorities");
	const tSources = useTranslations("Work.sources");
	const tAgents = useTranslations("Work.agents");
	return {
		state: (state: WorkItemState) => tStates(state),
		priority: (priority: number) => tPriorities(priorityKey(priority)),
		source: (source: WorkItemSource) => tSources(source),
		agent: (agent: WorkAgent) => tAgents(agent),
	};
}

export function PriorityIcon({ priority, label, className }: { priority: number; label?: string; className?: string }) {
	const { icon: Icon, className: tone } = PRIORITY_ICONS[priorityKey(priority)];
	return <Icon className={cn("size-4 shrink-0", tone, className)} aria-label={label} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} />;
}

export function StateIcon({ state, label, className }: { state: WorkItemState; label?: string; className?: string }) {
	const { icon: Icon, className: tone } = STATE_ICONS[state] ?? STATE_ICONS.backlog;
	return <Icon className={cn("size-4 shrink-0", tone, className)} aria-label={label} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} />;
}

export function SourceIcon({ source, label, className }: { source: WorkItemSource; label?: string; className?: string }) {
	const Icon = SOURCE_ICONS[source] ?? PenLine;
	return <Icon className={cn("size-3.5 shrink-0 text-muted-foreground", className)} aria-label={label} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} />;
}

function initials(name: string): string {
	const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
	return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function memberName(member: WorkMember | undefined): string | null {
	return member ? member.name?.trim() || member.email || null : null;
}

/** A person shows initials and a name; an agent shows a bot icon, so the two never look alike. */
export function AssigneeLabel({ agent, userId, members, compact = false }: { agent: WorkAgent | null; userId: string | null; members: WorkMember[]; compact?: boolean }) {
	const copy = useWorkCopy();
	const t = useTranslations("Work.people");
	if (agent) {
		const name = copy.agent(agent);
		return (
			<span className="inline-flex min-w-0 items-center gap-1.5 text-violet-700 dark:text-violet-300" title={name}>
				<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-violet-500/10"><Bot className="size-3.5" aria-hidden="true" /></span>
				<span className={cn("truncate text-xs", compact && "sr-only")}>{name}</span>
			</span>
		);
	}
	if (userId) {
		const name = memberName(members.find((member) => member.userId === userId)) ?? t("unknown");
		return (
			<span className="inline-flex min-w-0 items-center gap-1.5" title={name}>
				<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-medium text-foreground">{initials(name)}</span>
				<span className={cn("truncate text-xs", compact && "sr-only")}>{name}</span>
			</span>
		);
	}
	return <span className={cn("text-xs text-muted-foreground", compact && "sr-only")}>{t("unassigned")}</span>;
}

/** "3 hours ago" as plain text, for use inside a sentence. */
export function useRelativeTime() {
	const format = useFormatter();
	const now = useNow({ updateInterval: 60_000 });
	return (value: string | null | undefined): string => {
		const date = value ? new Date(value) : null;
		return date && !Number.isNaN(date.getTime()) ? format.relativeTime(date, now) : "";
	};
}

/** "3 hours ago", with the full date on hover. Refreshes every minute. */
export function TimeAgo({ value, className }: { value: string | null | undefined; className?: string }) {
	const format = useFormatter();
	const now = useNow({ updateInterval: 60_000 });
	const t = useTranslations("Work.common");
	if (!value) return <span className={className}>{t("never")}</span>;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return <span className={className}>{t("never")}</span>;
	return (
		<time dateTime={date.toISOString()} title={format.dateTime(date, { dateStyle: "medium", timeStyle: "short" })} className={cn("whitespace-nowrap", className)} suppressHydrationWarning>
			{format.relativeTime(date, now)}
		</time>
	);
}

/** A monospace block with a copy button, for tokens and setup snippets. */
export function CopyBlock({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
	const t = useTranslations("Work.common");
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	};
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs font-medium text-muted-foreground">{label}</span>
				<Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs" onClick={copy}>
					{copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
					{copied ? t("copied") : t("copy")}
				</Button>
			</div>
			<pre className={cn("overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs", multiline ? "max-h-80 whitespace-pre" : "whitespace-pre-wrap break-all")}>{value}</pre>
		</div>
	);
}
