import { Circle, CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleSlash, CircleX, GitMerge, MessageCircleQuestion, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { AgentProfile, StageStatus, WorkItem } from "../../../shared/factory/types";
import { cn } from "../../lib/utils";
import { HarnessLogo } from "../../components/HarnessLogo";
import { harnessNames } from "../../chat/ModelPicker";

export function harnessName(agent: Pick<AgentProfile, "harness">) {
	return harnessNames[agent.harness];
}

/** The harness mark, as the desktop model picker shows it. `plain` is kept for callers: the desktop marks have no tile. */
export function AgentMark({ agent, className }: { agent: Pick<AgentProfile, "harness"> | undefined; className?: string; plain?: boolean }) {
	if (!agent) return <span aria-hidden="true" className={cn("size-5 shrink-0 rounded-[4px] border border-dashed border-muted-foreground/40", className)} />;
	return <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center overflow-hidden [&_.harness-logo]:size-full! [&_img]:size-full! [&_svg]:size-full", className)}><HarnessLogo harness={agent.harness} /></span>;
}

/** Initials for people, so agents and humans read apart at a glance. */
/** A GitHub user's photo at any size: github.com redirects to it, for people whose photo Factory wasn't given. */
export function avatarFor(login: string, avatar?: string): string | undefined {
	if (avatar) return avatar;
	// Apps' bot accounts ("name[bot]") and deleted ones ("ghost") have no page to ask.
	return /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login) && login !== "ghost" ? `https://github.com/${login}.png?size=64` : undefined;
}

/** Someone's GitHub photo, or their initials while it loads or when there isn't one. */
export function PersonMark({ login, avatar, className }: { login: string; avatar?: string; className?: string }) {
	const src = avatarFor(login, avatar);
	const [failed, setFailed] = useState<string | null>(null);
	const initials = <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-[4px] bg-secondary text-3xs font-semibold text-secondary-foreground uppercase", className)}>
		{login.replace(/\[bot\]$/, "").replace(/[^a-z0-9]/gi, "").slice(0, 2)}
	</span>;
	if (!src || failed === src) return initials;
	return <img src={src} alt="" aria-hidden="true" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(src)} className={cn("size-5 shrink-0 rounded-[4px] bg-secondary object-cover", className)} />;
}

const STATUS = {
	idle: { icon: Circle, className: "text-muted-foreground/45", label: "Not started" },
	queued: { icon: CircleDashed, className: "text-muted-foreground", label: "Queued" },
	running: { icon: LoaderCircle, className: "text-info animate-spin [animation-duration:1.6s]", label: "Running" },
	done: { icon: CircleCheck, className: "text-success", label: "Passed" },
	failed: { icon: CircleX, className: "text-destructive", label: "Failed" },
	"needs-you": { icon: CircleAlert, className: "text-warning", label: "Needs you" },
	waiting: { icon: MessageCircleQuestion, className: "text-info", label: "Waiting on reporter" },
	skipped: { icon: CircleSlash, className: "text-muted-foreground/60", label: "Skipped" },
} satisfies Record<StageStatus, unknown>;

export function statusLabel(status: StageStatus) {
	return STATUS[status].label;
}

export function StatusMark({ status, className }: { status: StageStatus; className?: string }) {
	const { icon: Icon, className: tone } = STATUS[status];
	return <Icon aria-label={STATUS[status].label} className={cn("size-4 shrink-0", tone, className)} />;
}

export const MERGED = "text-[oklch(0.6_0.19_300)]";

/** GitHub's own marks for issues and pull requests, in GitHub's colours. */
export function ItemMark({ item, className }: { item: Pick<WorkItem, "kind" | "state">; className?: string }) {
	const size = cn("size-4 shrink-0", className);
	if (item.kind === "issue") return item.state === "closed" ? <CircleCheck className={cn(size, MERGED)} /> : <CircleDot className={cn(size, "text-success")} />;
	if (item.state === "merged") return <GitMerge className={cn(size, MERGED)} />;
	if (item.state === "closed") return <GitPullRequestClosed className={cn(size, "text-destructive")} />;
	if (item.state === "draft") return <GitPullRequestDraft className={cn(size, "text-muted-foreground")} />;
	return <GitPullRequest className={cn(size, "text-success")} />;
}
