import { Circle, CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleSlash, CircleX, GitMerge, MessageCircleQuestion, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { AgentProfile, StageStatus, WorkItem } from "../../shared/types";
import { cn } from "../lib/utils";
import claude from "../assets/claude.svg";
import openaiDark from "../../../../web/public/logos/openai_dark.svg";
import openaiLight from "../../../../web/public/logos/openai_light.svg";

/** The Phaseo "P" on a rounded tile. */
export function BrandMark({ className }: { className?: string }) {
	return <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] bg-foreground text-background", className)}>
		<svg viewBox="8 6 48 52" className="size-[70%]" fill="currentColor"><path d="M19.8574 56H13V8H19.8574V56ZM31.7197 8C37.9368 8 42.8288 9.4856 46.3945 12.457C49.9601 15.4284 51.7432 19.5201 51.7432 24.7314C51.7432 29.9428 49.9601 34.0344 46.3945 37.0059C42.8288 39.9773 37.9368 41.4629 31.7197 41.4629H23.2852V35.4971H31.5146C35.8573 35.497 39.1714 34.5824 41.457 32.7539C43.7426 30.8796 44.8857 28.2056 44.8857 24.7314C44.8857 21.2572 43.7427 18.6059 41.457 16.7773C39.1714 14.9031 35.8573 13.9659 31.5146 13.9658H23.2852V8H31.7197Z" /></svg>
	</span>;
}

const HARNESS_NAME = { claude: "Claude Code", codex: "Codex", phaseo: "Phaseo" } as const;

export function harnessName(agent: Pick<AgentProfile, "harness">) {
	return HARNESS_NAME[agent.harness];
}

/** Whose model the agent runs: the Claude mark for Claude Code, OpenAI for Codex, or the Phaseo mark. */
/** `plain`: just the glyph, without the tile behind it, as model pickers show it. */
export function AgentMark({ agent, className, plain }: { agent: Pick<AgentProfile, "harness"> | undefined; className?: string; plain?: boolean }) {
	if (!agent) return <span aria-hidden="true" className={cn("size-5 shrink-0 rounded-[4px] border border-dashed border-muted-foreground/40", className)} />;
	if (agent.harness === "phaseo") return <BrandMark className={className} />;
	// The logo on its own, without a tile behind it.
	const tile = cn("grid size-5 shrink-0 place-items-center overflow-hidden", className);
	const size = plain ? "size-full" : "size-[85%]";
	// Claude's orange mark reads on both themes; OpenAI's has a version for each.
	if (agent.harness === "claude") return <span aria-hidden="true" className={tile}><img src={claude} alt="" className={cn(size, "object-contain")} /></span>;
	return <span aria-hidden="true" className={tile}>
		<img src={openaiLight} alt="" className={cn(size, "object-contain dark:hidden")} />
		<img src={openaiDark} alt="" className={cn(size, "hidden object-contain dark:block")} />
	</span>;
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
