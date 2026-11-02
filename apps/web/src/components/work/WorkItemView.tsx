"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Bell, BellOff, Bot, ChevronRight, Copy, ExternalLink, GitBranch, GitPullRequest, MessageSquare, Pencil, Plus, RotateCcw, Sparkles, CircleCheck, Info, Bug, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { addWorkRelation, commentOnWorkItem, createGithubIssueForItem, createWorkItem, removeWorkRelation, setWorkSubscription, triageWorkItem, updateWorkItem, type UpdateWorkItemInput } from "@/app/(dashboard)/work/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatCostNanos, isClosedState, normaliseGithubRepo, parseItemNumber, parseLabels } from "@/lib/work/format";
import { assigneeKey, parseAssigneeKey } from "@/lib/work/inbox";
import { activeMention, insertMention, mentionHandle, mentionSuggestions } from "@/lib/work/mentions";
import { slaStatus } from "@/lib/work/sla";
import type { AgentRun, CustomerRequest, ErrorGroup, ReplyDraft, WorkCycle, WorkItem, WorkItemEvent, WorkItemSummary, WorkMember, WorkProject, WorkRelation, WorkSettings } from "@/lib/work/types";
import { ReplyDraftsSection } from "./ReplyDrafts";
import { useWorkAction } from "./useWorkAction";
import { AssigneeLabel, SlaBadge, SourceIcon, StateIcon, TimeAgo, memberName, useWorkCopy } from "./WorkBits";
import { WorkMarkdown } from "./WorkMarkdown";
import { AssigneeSelect, PrioritySelect, StateSelect } from "./WorkSelects";

export type WorkItemViewProps = {
	item: WorkItem;
	events: WorkItemEvent[];
	requests: CustomerRequest[];
	runs: AgentRun[];
	errorGroup: ErrorGroup | null;
	members: WorkMember[];
	projects?: WorkProject[];
	cycles?: WorkCycle[];
	settings?: WorkSettings | null;
	drafts?: ReplyDraft[];
	children?: WorkItemSummary[];
	parent?: WorkItemSummary | null;
	relations?: WorkRelation[];
	subscribed?: boolean;
};

export function WorkItemView({ item, events, requests, runs, errorGroup, members, projects = [], cycles = [], settings = null, drafts = [], children = [], parent = null, relations = [], subscribed = false }: WorkItemViewProps) {
	const t = useTranslations("Work.item");
	const { perform, busy } = useWorkAction();
	const [duplicateOpen, setDuplicateOpen] = useState(false);
	const [repoOpen, setRepoOpen] = useState(false);
	const update = (key: string, input: UpdateWorkItemInput) => perform(key, () => updateWorkItem(item.number, input));
	const closed = isClosedState(item.state);
	const sla = slaStatus(item, Date.now(), settings);

	const createIssue = (repo?: string) => perform("github", () => createGithubIssueForItem(item.number, repo));

	return (
		<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<div className="min-w-0 space-y-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<nav className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
						<Link href="/work" className="hover:text-foreground">{t("back")}</Link>
						<ChevronRight className="size-3" aria-hidden="true" />
						{parent ? (
							<>
								<Link href={`/work/${parent.number}`} className="max-w-48 truncate hover:text-foreground">#{parent.number} {parent.title}</Link>
								<ChevronRight className="size-3" aria-hidden="true" />
							</>
						) : null}
						<span className="font-mono">#{item.number}</span>
					</nav>
					<div className="flex items-center gap-2">
						<SlaBadge status={sla} />
						<SubscribeToggle number={item.number} subscribed={subscribed} />
					</div>
				</div>

				<div className="space-y-2">
					<InlineTitle key={`title-${item.updatedAt}`} value={item.title} label={t("titleLabel")} onSave={(title) => update("title", { title })} />
					<DescriptionEditor key={`description-${item.updatedAt}`} value={item.description} label={t("descriptionLabel")} placeholder={t("descriptionPlaceholder")} onSave={(description) => update("description", { description })} />
				</div>

				<div className="flex flex-wrap gap-2">
					<Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => perform("triage", () => triageWorkItem(item.number))}>
						<Sparkles aria-hidden="true" />
						{busy === "triage" ? t("triageRunning") : t("triage")}
					</Button>
					{item.githubIssueUrl ? null : (
						<Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => (item.githubRepo ? createIssue() : setRepoOpen(true))}>
							<GitBranch aria-hidden="true" />
							{t("createIssue")}
						</Button>
					)}
					{item.duplicateOf ? (
						<Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => update("duplicate", { duplicateOf: null })}>
							<Copy aria-hidden="true" />
							{t("clearDuplicate")}
						</Button>
					) : (
						<Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setDuplicateOpen(true)}>
							<Copy aria-hidden="true" />
							{t("markDuplicate")}
						</Button>
					)}
					<Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => update("state", { state: closed ? "todo" : "done" })}>
						{closed ? <RotateCcw aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
						{closed ? t("reopen") : t("close")}
					</Button>
				</div>

				{item.triageSummary ? (
					<section aria-labelledby="work-triage-summary" className="space-y-1.5">
						<h2 id="work-triage-summary" className="flex items-center gap-1.5 text-sm font-medium"><Bot className="size-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />{t("triageSummary")}</h2>
						<p className="text-sm whitespace-pre-wrap text-muted-foreground">{item.triageSummary}</p>
					</section>
				) : null}

				<SubItemsSection item={item} items={children} />
				<RelationsSection number={item.number} relations={relations} />
				<RequestsSection requests={requests} />
				<ReplyDraftsSection drafts={drafts.filter((draft) => draft.workItemId === item.id)} requests={requests} />
				<RunsSection runs={runs} />
				<Timeline item={item} events={events} members={members} />
			</div>

			<ItemProperties item={item} errorGroup={errorGroup} members={members} projects={projects} cycles={cycles} parent={parent} busy={busy} onUpdate={update} />

			<DuplicateDialog open={duplicateOpen} onOpenChange={setDuplicateOpen} current={item.number} onSubmit={async (number) => {
				const result = await update("duplicate", { duplicateOf: number, state: "cancelled" });
				if (result.ok) setDuplicateOpen(false);
			}} />
			<RepoDialog open={repoOpen} onOpenChange={setRepoOpen} onSubmit={async (repo) => {
				const result = await createIssue(repo);
				if (result.ok) setRepoOpen(false);
			}} />
		</div>
	);
}

function InlineTitle({ value, label, onSave }: { value: string; label: string; onSave: (value: string) => unknown }) {
	const [draft, setDraft] = useState(value);
	const commit = () => {
		const next = draft.trim();
		if (!next) setDraft(value);
		else if (next !== value) onSave(next);
	};
	return (
		<Input
			value={draft}
			aria-label={label}
			maxLength={300}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); }
			}}
			className="h-auto rounded-md border-transparent bg-transparent px-1.5 py-1 text-xl font-semibold shadow-none hover:border-border focus-visible:border-ring md:text-xl dark:bg-transparent"
		/>
	);
}

/** The description as Markdown; Edit (or a click on an empty one) swaps in the text box. */
function DescriptionEditor({ value, label, placeholder, onSave }: { value: string; label: string; placeholder: string; onSave: (value: string) => unknown }) {
	const t = useTranslations("Work.item");
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	if (editing) {
		const finish = () => { setEditing(false); if (draft !== value) onSave(draft); };
		return (
			<div className="space-y-1">
				<Textarea
					autoFocus
					value={draft}
					aria-label={label}
					placeholder={placeholder}
					maxLength={20000}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={finish}
					onKeyDown={(event) => {
						if (event.key === "Escape") { setDraft(value); setEditing(false); }
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.blur();
					}}
					className="field-sizing-content min-h-24 rounded-md px-1.5 font-mono text-sm"
				/>
				<p className="px-1.5 text-xs text-muted-foreground">{t("markdownHint")}</p>
			</div>
		);
	}
	if (!value.trim()) {
		return <button type="button" onClick={() => setEditing(true)} className="block w-full rounded-md px-1.5 py-1 text-left text-sm text-muted-foreground hover:bg-muted/40">{placeholder}</button>;
	}
	return (
		<div className="group relative rounded-md px-1.5 py-1 hover:bg-muted/30">
			<WorkMarkdown>{value}</WorkMarkdown>
			<Button type="button" variant="ghost" size="icon-xs" aria-label={t("editDescription")} title={t("editDescription")} onClick={() => setEditing(true)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><Pencil aria-hidden="true" /></Button>
		</div>
	);
}

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="min-w-0 text-sm">{children}</dd>
		</div>
	);
}

function TextProperty({ value, label, placeholder, mono, onSave }: { value: string; label: string; placeholder?: string; mono?: boolean; onSave: (value: string) => unknown }) {
	const [draft, setDraft] = useState(value);
	return (
		<Input
			value={draft}
			aria-label={label}
			placeholder={placeholder}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => { if (draft.trim() !== value) onSave(draft.trim()); }}
			onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); }
			}}
			className={cn("h-7 rounded-md border-transparent bg-transparent px-2 text-sm shadow-none hover:border-border focus-visible:border-ring dark:bg-transparent", mono && "font-mono text-xs")}
		/>
	);
}

function ExternalRow({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 px-2 text-sm hover:underline">
			<span className="truncate">{children}</span>
			<ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
		</a>
	);
}

function ItemProperties({ item, errorGroup, members, projects, cycles, parent, busy, onUpdate }: { item: WorkItem; errorGroup: ErrorGroup | null; members: WorkMember[]; projects: WorkProject[]; cycles: WorkCycle[]; parent: WorkItemSummary | null; busy: string | null; onUpdate: (key: string, input: UpdateWorkItemInput) => unknown }) {
	const t = useTranslations("Work.item");
	const tCreate = useTranslations("Work.create");
	const tCommon = useTranslations("Work.common");
	const copy = useWorkCopy();
	const disabled = busy !== null;
	const prNumber = item.githubPrUrl?.match(/\/pull\/(\d+)/)?.[1];
	const parentNumber = parent?.number ?? item.parentNumber ?? null;
	return (
		<aside aria-label={t("properties")} className="space-y-5 lg:border-l lg:pl-6">
			<dl className="space-y-1.5">
				<PropertyRow label={t("state")}><StateSelect size="sm" label={t("state")} value={item.state} disabled={disabled} onChange={(state) => onUpdate("state", { state })} className="border-transparent bg-transparent hover:bg-muted" /></PropertyRow>
				<PropertyRow label={t("priority")}><PrioritySelect size="sm" label={t("priority")} value={item.priority} disabled={disabled} onChange={(priority) => onUpdate("priority", { priority })} className="border-transparent bg-transparent hover:bg-muted" /></PropertyRow>
				<PropertyRow label={t("assignee")}><AssigneeSelect size="sm" label={t("assignee")} value={assigneeKey(item)} members={members} disabled={disabled} onChange={(value) => onUpdate("assignee", parseAssigneeKey(value))} className="border-transparent bg-transparent hover:bg-muted" /></PropertyRow>
				<PropertyRow label={t("project")}>
					<OptionProperty label={t("project")} value={item.projectId ?? "none"} disabled={disabled} noneLabel={t("noProject")}
						options={projects.map((project) => ({ value: project.id, label: project.name }))}
						onChange={(value) => onUpdate("project", { projectId: value === "none" ? null : value })} />
				</PropertyRow>
				<PropertyRow label={t("cycle")}>
					<OptionProperty label={t("cycle")} value={item.cycleId ?? "none"} disabled={disabled} noneLabel={t("noCycle")}
						options={cycles.map((cycle) => ({ value: cycle.id, label: cycle.name || t("cycleNumber", { number: cycle.number }) }))}
						onChange={(value) => onUpdate("cycle", { cycleId: value === "none" ? null : value })} />
				</PropertyRow>
				<PropertyRow label={t("estimate")}>
					<TextProperty key={`estimate-${item.estimate ?? ""}`} value={typeof item.estimate === "number" ? String(item.estimate) : ""} label={t("estimate")} placeholder={t("estimatePlaceholder")} onSave={(value) => {
						if (!value) return onUpdate("estimate", { estimate: null });
						const points = Number(value);
						if (Number.isInteger(points) && points >= 0 && points <= 21) return onUpdate("estimate", { estimate: points });
					}} />
				</PropertyRow>
				<PropertyRow label={t("parent")}>
					<TextProperty key={`parent-${parentNumber ?? ""}`} mono value={parentNumber ? `#${parentNumber}` : ""} label={t("parent")} placeholder={t("parentPlaceholder")} onSave={(value) => {
						if (!value) return onUpdate("parent", { parentNumber: null });
						const number = parseItemNumber(value);
						if (number && number !== item.number) return onUpdate("parent", { parentNumber: number });
					}} />
				</PropertyRow>
				<PropertyRow label={t("labels")}>
					<TextProperty key={`labels-${item.labels.join(",")}`} value={item.labels.join(", ")} label={t("labels")} placeholder={t("labelsPlaceholder")} onSave={(value) => onUpdate("labels", { labels: parseLabels(value) })} />
				</PropertyRow>
				<PropertyRow label={t("repo")}>
					<TextProperty key={`repo-${item.githubRepo ?? ""}`} mono value={item.githubRepo ?? ""} label={t("repo")} placeholder={tCreate("repoPlaceholder")} onSave={(value) => {
						if (!value) return onUpdate("repo", { githubRepo: null });
						const repo = normaliseGithubRepo(value);
						if (repo) return onUpdate("repo", { githubRepo: repo });
					}} />
				</PropertyRow>
				{item.githubIssueUrl ? <PropertyRow label={t("issue")}><ExternalRow href={item.githubIssueUrl}>{item.githubRepo ? `${item.githubRepo}#${item.githubIssueNumber ?? ""}` : `#${item.githubIssueNumber ?? ""}`}</ExternalRow></PropertyRow> : null}
				{item.githubPrUrl ? <PropertyRow label={t("pullRequest")}><ExternalRow href={item.githubPrUrl}><GitPullRequest className="mr-1 inline size-3.5" aria-hidden="true" />{prNumber ? `#${prNumber}` : tCommon("openOnGithub")}</ExternalRow></PropertyRow> : null}
				{item.duplicateOf ? (
					<PropertyRow label={t("duplicateOf")}>
						{item.duplicateOfNumber ? <Link href={`/work/${item.duplicateOfNumber}`} className="px-2 font-mono text-sm hover:underline">#{item.duplicateOfNumber}</Link> : <span className="px-2 text-sm text-muted-foreground">{tCommon("none")}</span>}
					</PropertyRow>
				) : null}
				{errorGroup ? (
					<PropertyRow label={t("errorGroup")}>
						<Link href={`/work/errors/${errorGroup.id}`} className="block px-2 hover:underline">
							<span className="flex items-center gap-1 truncate font-mono text-xs"><Bug className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{errorGroup.exceptionType}</span>
							<span className="text-xs text-muted-foreground">{t("errorEvents", { count: errorGroup.eventCount })} · <TimeAgo value={errorGroup.lastSeenAt} /></span>
						</Link>
					</PropertyRow>
				) : null}
			</dl>
			<dl className="space-y-1.5 border-t pt-4">
				{item.slaDueAt ? <PropertyRow label={t("slaDue")}><TimeAgo value={item.slaDueAt} className="px-2 text-muted-foreground" /></PropertyRow> : null}
				<PropertyRow label={t("source")}><span className="inline-flex items-center gap-1.5 px-2"><SourceIcon source={item.source} />{copy.source(item.source)}</span></PropertyRow>
				<PropertyRow label={t("created")}><TimeAgo value={item.createdAt} className="px-2 text-muted-foreground" /></PropertyRow>
				<PropertyRow label={t("updated")}><TimeAgo value={item.updatedAt} className="px-2 text-muted-foreground" /></PropertyRow>
			</dl>
		</aside>
	);
}

function RequestsSection({ requests }: { requests: CustomerRequest[] }) {
	const t = useTranslations("Work.item");
	const tRequests = useTranslations("Work.requests");
	if (!requests.length) return null;
	return (
		<section aria-labelledby="work-item-requests" className="space-y-2">
			<h2 id="work-item-requests" className="text-sm font-medium">{t("requests")}</h2>
			<Callout tone="info" icon={Info}>{t("requestsPrivate")}</Callout>
			<ul className="divide-y rounded-md border">
				{requests.map((request) => (
					<li key={request.id} className="space-y-1.5 px-3 py-2.5">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
							<MessageSquare className="size-3.5" aria-hidden="true" />
							{request.customerId ? <Link href={`/work/customers/${request.customerId}`} className="font-medium text-foreground hover:underline">{request.customerName ?? t("anonymousCustomer")}</Link> : <span className="font-medium text-foreground">{request.customerName ?? t("anonymousCustomer")}</span>}
							{request.contactName || request.contactEmail ? <span>{[request.contactName, request.contactEmail].filter(Boolean).join(" · ")}</span> : null}
							<span>· {tRequests(`sources.${request.source}`)}</span>
							<span>· <TimeAgo value={request.createdAt} /></span>
						</div>
						{request.subject ? <p className="text-sm font-medium">{request.subject}</p> : null}
						<p className="text-sm whitespace-pre-wrap">{request.body}</p>
					</li>
				))}
			</ul>
		</section>
	);
}

const RUN_STATUS_TONE: Record<AgentRun["status"], string> = {
	queued: "text-muted-foreground",
	running: "text-amber-600 dark:text-amber-400",
	succeeded: "text-emerald-600 dark:text-emerald-400",
	failed: "text-destructive",
	cancelled: "text-muted-foreground",
};

function RunsSection({ runs }: { runs: AgentRun[] }) {
	const t = useTranslations("Work.item");
	const tStatus = useTranslations("Work.runStatus");
	const tRunners = useTranslations("Work.runners");
	const copy = useWorkCopy();
	if (!runs.length) return null;
	return (
		<section aria-labelledby="work-item-runs" className="space-y-2">
			<h2 id="work-item-runs" className="text-sm font-medium">{t("runs")}</h2>
			<div className="overflow-x-auto rounded-md border">
				<table className="w-full text-sm">
					<thead className="border-b text-left text-xs text-muted-foreground">
						<tr>
							<th className="px-3 py-2 font-normal">{t("runAgent")}</th>
							<th className="px-3 py-2 font-normal">{t("runStatus")}</th>
							<th className="px-3 py-2 font-normal">{t("runModel")}</th>
							<th className="px-3 py-2 text-right font-normal">{t("runCost")}</th>
							<th className="px-3 py-2 font-normal">{t("runStarted")}</th>
							<th className="px-3 py-2 font-normal"><span className="sr-only">{t("runLink")}</span></th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{runs.map((run) => (
							<tr key={run.id} className="align-top">
								<td className="px-3 py-2">
									<span className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300"><Bot className="size-3.5" aria-hidden="true" />{copy.agent(run.agent)}</span>
									<span className="block text-xs text-muted-foreground">{tRunners(run.runner)}</span>
									{run.summary ? <span className="mt-1 block max-w-md text-xs whitespace-pre-wrap text-muted-foreground">{run.summary}</span> : null}
								</td>
								<td className={cn("px-3 py-2 whitespace-nowrap", RUN_STATUS_TONE[run.status])}>{tStatus(run.status)}</td>
								<td className="px-3 py-2 font-mono text-xs">{run.model ?? "—"}</td>
								<td className="px-3 py-2 text-right tabular-nums">{formatCostNanos(run.costNanos)}</td>
								<td className="px-3 py-2 text-xs text-muted-foreground"><TimeAgo value={run.startedAt ?? run.createdAt} /></td>
								<td className="px-3 py-2">{run.externalUrl ? <a href={run.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline">{t("viewRun")}<ExternalLink className="size-3" aria-hidden="true" /></a> : null}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function EventAvatar({ event, members }: { event: WorkItemEvent; members: WorkMember[] }) {
	const base = "flex size-6 shrink-0 items-center justify-center rounded-md";
	switch (event.authorKind) {
		case "agent": return <span className={cn(base, "bg-violet-500/10 text-violet-700 dark:text-violet-300")}><Bot className="size-3.5" aria-hidden="true" /></span>;
		case "github": return <span className={cn(base, "bg-muted text-foreground")}><GitBranch className="size-3.5" aria-hidden="true" /></span>;
		case "customer": return <span className={cn(base, "bg-sky-500/10 text-sky-700 dark:text-sky-300")}><MessageSquare className="size-3.5" aria-hidden="true" /></span>;
		case "user": {
			return <span className="flex size-6 shrink-0 items-center justify-center"><AssigneeLabel agent={null} userId={event.authorUserId} members={members} compact /></span>;
		}
		default: return <span className={cn(base, "text-muted-foreground")}><span className="size-1.5 rounded-md bg-muted-foreground" /></span>;
	}
}

function Timeline({ item, events, members }: { item: WorkItem; events: WorkItemEvent[]; members: WorkMember[] }) {
	const t = useTranslations("Work.item");
	const tEvents = useTranslations("Work.events");
	const tAuthors = useTranslations("Work.authors");
	const ordered = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
	const author = (event: WorkItemEvent) => event.authorName
		?? (event.authorKind === "user" ? memberName(members.find((member) => member.userId === event.authorUserId)) : null)
		?? tAuthors(event.authorKind);
	return (
		<section aria-labelledby="work-item-activity" className="space-y-3">
			<h2 id="work-item-activity" className="text-sm font-medium">{t("activity")}</h2>
			{ordered.length ? (
				<ol className="space-y-3">
					{ordered.map((event) => {
						const url = typeof event.data.url === "string" && /^https:\/\//.test(event.data.url) ? event.data.url : null;
						if (event.kind === "comment") {
							return (
								<li key={event.id} className="flex gap-3">
									<EventAvatar event={event} members={members} />
									<div className="min-w-0 flex-1 rounded-md border">
										<div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
											<span className="font-medium text-foreground">{author(event)}</span>
											<TimeAgo value={event.createdAt} />
											{url ? <a href={url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 hover:text-foreground"><ExternalLink className="size-3" aria-hidden="true" /></a> : null}
										</div>
										<WorkMarkdown className="px-3 py-2">{event.body}</WorkMarkdown>
									</div>
								</li>
							);
						}
						return (
							<li key={event.id} className="flex items-start gap-3 text-xs text-muted-foreground">
								<EventAvatar event={event} members={members} />
								<div className="min-w-0 flex-1 pt-1">
									<span className="font-medium text-foreground">{author(event)}</span> {tEvents(event.kind)}
									{event.body ? <span className={cn("block whitespace-pre-wrap", event.kind === "triage" || event.kind === "agent_run" ? "mt-1 text-foreground/80" : "")}>{event.body}</span> : null}
								</div>
								<span className="flex shrink-0 items-center gap-2 pt-1">
									{url ? <a href={url} target="_blank" rel="noreferrer" className="hover:text-foreground"><ExternalLink className="size-3" aria-hidden="true" /></a> : null}
									<TimeAgo value={event.createdAt} />
								</span>
							</li>
						);
					})}
				</ol>
			) : <p className="text-sm text-muted-foreground">{t("noActivity")}</p>}
			<CommentBox number={item.number} members={members} />
		</section>
	);
}

function CommentBox({ number, members }: { number: number; members: WorkMember[] }) {
	const t = useTranslations("Work.item");
	const { perform, busy } = useWorkAction();
	const [body, setBody] = useState("");
	const [caret, setCaret] = useState(0);
	const [highlight, setHighlight] = useState(0);
	const [dismissed, setDismissed] = useState<number | null>(null);
	const textarea = useRef<HTMLTextAreaElement>(null);
	const mention = activeMention(body, caret);
	const suggestions = mention && dismissed !== mention.start ? mentionSuggestions(members, mention.query) : [];
	const listId = useId();
	const choose = (member: WorkMember) => {
		if (!mention) return;
		const next = insertMention(body, mention, member);
		setBody(next.text);
		setCaret(next.caret);
		setHighlight(0);
		window.requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(next.caret, next.caret); });
	};
	const submit = async (event?: FormEvent) => {
		event?.preventDefault();
		if (!body.trim()) return;
		const result = await perform("comment", () => commentOnWorkItem(number, body.trim()));
		if (result.ok) setBody("");
	};
	return (
		<form onSubmit={submit} className="space-y-2">
			<div className="relative">
				<Textarea
					ref={textarea}
					value={body}
					rows={3}
					maxLength={20000}
					aria-label={t("comment")}
					placeholder={t("commentPlaceholder")}
					role="combobox"
					aria-expanded={suggestions.length > 0}
					aria-controls={suggestions.length ? listId : undefined}
					aria-autocomplete="list"
					aria-activedescendant={suggestions.length ? `${listId}-${Math.min(highlight, suggestions.length - 1)}` : undefined}
					onChange={(event) => { setBody(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); setHighlight(0); }}
					onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
					onKeyDown={(event) => {
						if (suggestions.length) {
							if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((highlight + 1) % suggestions.length); return; }
							if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((highlight - 1 + suggestions.length) % suggestions.length); return; }
							if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(suggestions[Math.min(highlight, suggestions.length - 1)]!); return; }
							if (event.key === "Escape") { event.preventDefault(); setDismissed(mention?.start ?? null); return; }
						}
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
					}}
					className="rounded-md"
				/>
				{suggestions.length ? (
					<ul id={listId} role="listbox" aria-label={t("mentionSuggestions")} className="absolute top-full left-0 z-20 mt-1 w-64 overflow-hidden rounded-md border bg-popover py-1 text-sm shadow-md">
						{suggestions.map((member, index) => (
							<li key={member.userId} id={`${listId}-${index}`} role="option" aria-selected={index === highlight}
								onMouseDown={(event) => { event.preventDefault(); choose(member); }}
								className={cn("flex cursor-pointer items-center gap-2 px-2 py-1", index === highlight && "bg-muted")}>
								<AssigneeLabel agent={null} userId={member.userId} members={members} />
								<span className="ml-auto font-mono text-xs text-muted-foreground">@{mentionHandle(member)}</span>
							</li>
						))}
					</ul>
				) : null}
			</div>
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs text-muted-foreground">{t("commentHint")}</span>
				<Button type="submit" size="sm" disabled={busy !== null || !body.trim()}>{t("comment")}</Button>
			</div>
		</form>
	);
}

function DuplicateDialog({ open, onOpenChange, current, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; current: number; onSubmit: (number: number) => Promise<void> }) {
	const t = useTranslations("Work.item");
	const tCommon = useTranslations("Work.common");
	const id = useId();
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const number = parseItemNumber(value);
		if (!number || number === current) return setError(t("duplicateInvalid"));
		setError(null);
		await onSubmit(number);
	};
	return (
		<Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
			<DialogContent className="rounded-md">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{t("duplicateTitle")}</DialogTitle>
						<DialogDescription>{t("duplicateDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={id}>{t("duplicateLabel")}</Label>
						<Input id={id} autoFocus inputMode="numeric" value={value} placeholder="42" onChange={(event) => setValue(event.target.value)} className="rounded-md font-mono" />
						{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
						<Button type="submit">{t("markDuplicate")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function RepoDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (repo: string) => Promise<void> }) {
	const t = useTranslations("Work.item");
	const tCreate = useTranslations("Work.create");
	const tCommon = useTranslations("Work.common");
	const id = useId();
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const repo = normaliseGithubRepo(value);
		if (!repo) return setError(tCreate("repoInvalid"));
		setError(null);
		await onSubmit(repo);
	};
	return (
		<Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
			<DialogContent className="rounded-md">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{t("createIssue")}</DialogTitle>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={id}>{t("repoPrompt")}</Label>
						<Input id={id} autoFocus value={value} placeholder={tCreate("repoPlaceholder")} onChange={(event) => setValue(event.target.value)} className="rounded-md font-mono" />
						{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
						<Button type="submit">{t("createIssue")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function SubscribeToggle({ number, subscribed }: { number: number; subscribed: boolean }) {
	const t = useTranslations("Work.item");
	const { perform, busy } = useWorkAction();
	const [optimistic, setOptimistic] = useState<boolean | null>(null);
	const [seen, setSeen] = useState(subscribed);
	if (seen !== subscribed) { setSeen(subscribed); setOptimistic(null); }
	const on = optimistic ?? subscribed;
	const toggle = async () => {
		setOptimistic(!on);
		const result = await perform("subscription", () => setWorkSubscription(number, !on));
		if (!result.ok) setOptimistic(null);
	};
	return (
		<Button type="button" size="sm" variant="ghost" aria-pressed={on} disabled={busy !== null} onClick={toggle} title={on ? t("unsubscribeHint") : t("subscribeHint")}>
			{on ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
			{on ? t("unsubscribe") : t("subscribe")}
		</Button>
	);
}

function OptionProperty({ label, value, options, noneLabel, disabled, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; noneLabel: string; disabled: boolean; onChange: (value: string) => void }) {
	const selected = options.find((option) => option.value === value);
	return (
		<Select value={value} disabled={disabled} onValueChange={(next) => { if (next !== value) onChange(next); }}>
			<SelectTrigger size="sm" aria-label={label} className="w-full justify-between rounded-md border-transparent bg-transparent hover:bg-muted">
				<SelectValue><span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? (value === "none" ? noneLabel : "…")}</span></SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="none">{noneLabel}</SelectItem>
				{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
			</SelectContent>
		</Select>
	);
}

function SubItemsSection({ item, items }: { item: WorkItem; items: WorkItemSummary[] }) {
	const t = useTranslations("Work.item");
	const copy = useWorkCopy();
	const { perform, busy } = useWorkAction();
	const [title, setTitle] = useState("");
	const [adding, setAdding] = useState(false);
	const done = items.filter((child) => isClosedState(child.state)).length;
	const add = async (event: FormEvent) => {
		event.preventDefault();
		if (!title.trim()) return;
		const result = await perform("sub-item", () => createWorkItem({
			title: title.trim(),
			parentNumber: item.number,
			state: "todo",
			...(item.projectId ? { projectId: item.projectId } : {}),
			...(item.cycleId ? { cycleId: item.cycleId } : {}),
		}));
		if (result.ok) setTitle("");
	};
	return (
		<section aria-labelledby="work-item-children" className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<h2 id="work-item-children" className="text-sm font-medium">
					{t("subItems")}
					{items.length ? <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">{t("doneOf", { done, total: items.length })}</span> : null}
				</h2>
				{adding ? null : <Button type="button" size="xs" variant="ghost" onClick={() => setAdding(true)}><Plus aria-hidden="true" />{t("addSubItem")}</Button>}
			</div>
			{items.length ? (
				<ul className="divide-y rounded-md border">
					{items.map((child) => (
						<li key={child.id} className="relative flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted/40">
							<StateIcon state={child.state} label={copy.state(child.state)} />
							<span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{child.number}</span>
							<Link href={`/work/${child.number}`} className={cn("min-w-0 flex-1 truncate after:absolute after:inset-0", isClosedState(child.state) && "text-muted-foreground line-through")}>{child.title}</Link>
						</li>
					))}
				</ul>
			) : null}
			{adding ? (
				<form onSubmit={add} className="flex gap-2">
					<Input autoFocus value={title} maxLength={300} aria-label={t("subItemTitle")} placeholder={t("subItemTitle")} onChange={(event) => setTitle(event.target.value)}
						onKeyDown={(event) => { if (event.key === "Escape") { setTitle(""); setAdding(false); } }} className="h-8 rounded-md text-sm" />
					<Button type="submit" size="sm" disabled={busy !== null || !title.trim()}>{t("add")}</Button>
					<Button type="button" size="icon-sm" variant="ghost" aria-label={t("cancelAdd")} onClick={() => { setTitle(""); setAdding(false); }}><X aria-hidden="true" /></Button>
				</form>
			) : null}
		</section>
	);
}

type RelationChoice = "blocks" | "blocked_by" | "related";

function relationGroup(relation: WorkRelation): RelationChoice {
	return relation.direction;
}

function RelationsSection({ number, relations }: { number: number; relations: WorkRelation[] }) {
	const t = useTranslations("Work.item");
	const copy = useWorkCopy();
	const { perform, busy } = useWorkAction();
	const [adding, setAdding] = useState(false);
	const [choice, setChoice] = useState<RelationChoice>("blocks");
	const [other, setOther] = useState("");
	const [error, setError] = useState<string | null>(null);
	const groups = (["blocked_by", "blocks", "related"] as const).map((group) => ({ group, relations: relations.filter((relation) => relationGroup(relation) === group) })).filter((entry) => entry.relations.length);

	const add = async (event: FormEvent) => {
		event.preventDefault();
		const otherNumber = parseItemNumber(other);
		if (!otherNumber || otherNumber === number) return setError(t("duplicateInvalid"));
		setError(null);
		const result = await perform("relation", () => addWorkRelation(number, choice, otherNumber));
		if (result.ok) { setOther(""); setAdding(false); }
	};

	return (
		<section aria-labelledby="work-item-relations" className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<h2 id="work-item-relations" className="text-sm font-medium">{t("relations")}</h2>
				{adding ? null : <Button type="button" size="xs" variant="ghost" onClick={() => setAdding(true)}><Plus aria-hidden="true" />{t("addRelation")}</Button>}
			</div>
			{groups.map(({ group, relations: entries }) => (
				<div key={group} className="space-y-1">
					<p className={cn("text-xs", group === "blocked_by" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{t(`relationKinds.${group}`)}</p>
					<ul className="divide-y rounded-md border">
						{entries.map((relation) => (
							<li key={relation.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
								{relation.otherState ? <StateIcon state={relation.otherState} label={copy.state(relation.otherState)} /> : <span className="size-4 shrink-0" />}
								<span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{relation.otherNumber ? `#${relation.otherNumber}` : "—"}</span>
								{relation.otherNumber ? <Link href={`/work/${relation.otherNumber}`} className="min-w-0 flex-1 truncate hover:underline">{relation.otherTitle ?? ""}</Link> : <span className="min-w-0 flex-1 truncate text-muted-foreground">{relation.otherTitle ?? ""}</span>}
								<Button type="button" size="icon-xs" variant="ghost" disabled={busy !== null} aria-label={t("removeRelation", { number: relation.otherNumber ?? "" })} title={t("removeRelation", { number: relation.otherNumber ?? "" })}
									onClick={() => perform("relation-remove", () => removeWorkRelation(number, relation.id))}><X aria-hidden="true" /></Button>
							</li>
						))}
					</ul>
				</div>
			))}
			{!groups.length && !adding ? <p className="text-xs text-muted-foreground">{t("noRelations")}</p> : null}
			{adding ? (
				<form onSubmit={add} className="flex flex-wrap items-start gap-2">
					<Select value={choice} onValueChange={(value) => setChoice(value as RelationChoice)}>
						<SelectTrigger size="sm" aria-label={t("relationKind")} className="w-36 rounded-md"><SelectValue>{t(`relationKinds.${choice}`)}</SelectValue></SelectTrigger>
						<SelectContent>
							{(["blocks", "blocked_by", "related"] as const).map((kind) => <SelectItem key={kind} value={kind}>{t(`relationKinds.${kind}`)}</SelectItem>)}
						</SelectContent>
					</Select>
					<div className="space-y-1">
						<Input autoFocus inputMode="numeric" value={other} placeholder="42" aria-label={t("relationOther")} onChange={(event) => setOther(event.target.value)} className="h-7 w-28 rounded-md font-mono text-sm" />
						{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
					</div>
					<Button type="submit" size="sm" disabled={busy !== null || !other.trim()}>{t("add")}</Button>
					<Button type="button" size="icon-sm" variant="ghost" aria-label={t("cancelAdd")} onClick={() => { setOther(""); setError(null); setAdding(false); }}><X aria-hidden="true" /></Button>
				</form>
			) : null}
		</section>
	);
}
