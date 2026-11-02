"use client";

import { useId, useState, type FormEvent } from "react";
import { ChevronRight, Columns3, List, Pencil, Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { createWorkProject, deleteWorkProject, updateWorkProject, type WorkProjectInput } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { slaStatus } from "@/lib/work/sla";
import { WORK_PROJECT_STATES, type WorkCycle, type WorkItem, type WorkMember, type WorkProject, type WorkProjectState } from "@/lib/work/types";
import { CreateItemDialog } from "./CreateItemDialog";
import { useWorkAction } from "./useWorkAction";
import { WorkBoard } from "./WorkBoard";
import { AssigneeLabel, PriorityIcon, ProgressBar, SlaBadge, StateIcon, TimeAgo, memberName, useWorkCopy } from "./WorkBits";
import { WorkMarkdown } from "./WorkMarkdown";

/** yyyy-mm-dd shown as a date, without shifting it across time zones. */
export function useDayFormat() {
	const format = useFormatter();
	return (value: string | null | undefined) => {
		if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "";
		return format.dateTime(new Date(`${value.slice(0, 10)}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
	};
}

const PROJECT_STATE_TONE: Record<WorkProjectState, string> = {
	planned: "text-muted-foreground",
	active: "text-sky-700 dark:text-sky-300",
	paused: "text-amber-700 dark:text-amber-300",
	completed: "text-emerald-700 dark:text-emerald-300",
	cancelled: "text-muted-foreground line-through",
};

export function ProjectsView({ projects, members }: { projects: WorkProject[]; members: WorkMember[] }) {
	const t = useTranslations("Work.projects");
	const formatDay = useDayFormat();
	const [editing, setEditing] = useState<WorkProject | "new" | null>(null);
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("description")}</p>
				</div>
				<Button type="button" size="sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" />{t("new")}</Button>
			</div>
			{projects.length ? (
				<div className="overflow-x-auto rounded-md border">
					<table className="w-full text-sm">
						<thead className="border-b text-left text-xs text-muted-foreground">
							<tr>
								<th className="px-3 py-2 font-normal">{t("name")}</th>
								<th className="px-3 py-2 font-normal">{t("state")}</th>
								<th className="px-3 py-2 font-normal">{t("progress")}</th>
								<th className="px-3 py-2 font-normal">{t("lead")}</th>
								<th className="px-3 py-2 font-normal">{t("targetDate")}</th>
								<th className="px-3 py-2 font-normal"><span className="sr-only">{t("edit")}</span></th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{projects.map((project) => (
								<tr key={project.id} className="hover:bg-muted/40">
									<td className="px-3 py-2"><Link href={`/work/projects/${project.id}`} className="font-medium hover:underline">{project.name}</Link></td>
									<td className={cn("px-3 py-2 whitespace-nowrap", PROJECT_STATE_TONE[project.state])}>{t(`states.${project.state}`)}</td>
									<td className="px-3 py-2 whitespace-nowrap">
										<ProgressBar value={project.progress} label={t("progressOf", { name: project.name })} />
										<span className="ml-2 text-xs text-muted-foreground tabular-nums">{t("doneOf", { done: project.doneCount, total: project.itemCount })}</span>
									</td>
									<td className="px-3 py-2">{project.leadUserId ? <AssigneeLabel agent={null} userId={project.leadUserId} members={members} /> : <span className="text-xs text-muted-foreground">{t("noLead")}</span>}</td>
									<td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{formatDay(project.targetDate) || "—"}</td>
									<td className="px-3 py-2 text-right"><Button type="button" variant="ghost" size="icon-xs" aria-label={t("editNamed", { name: project.name })} onClick={() => setEditing(project)}><Pencil aria-hidden="true" /></Button></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>}
			{editing ? <ProjectDialog project={editing === "new" ? null : editing} members={members} onClose={() => setEditing(null)} /> : null}
		</div>
	);
}

export function ProjectDialog({ project, members, onClose }: { project: WorkProject | null; members: WorkMember[]; onClose: () => void }) {
	const t = useTranslations("Work.projects");
	const tCommon = useTranslations("Work.common");
	const tPeople = useTranslations("Work.people");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [draft, setDraft] = useState({
		name: project?.name ?? "",
		description: project?.description ?? "",
		state: project?.state ?? ("planned" as WorkProjectState),
		lead: project?.leadUserId ?? "none",
		targetDate: project?.targetDate?.slice(0, 10) ?? "",
	});
	const [error, setError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!draft.name.trim()) return setError(t("nameRequired"));
		setError(null);
		const input: WorkProjectInput = {
			name: draft.name.trim(),
			description: draft.description.trim(),
			state: draft.state,
			leadUserId: draft.lead === "none" ? null : draft.lead,
			targetDate: draft.targetDate || null,
		};
		const result = await perform("project", () => (project ? updateWorkProject(project.id, input) : createWorkProject(input)));
		if (result.ok) onClose();
	};
	const remove = async () => {
		if (!project) return;
		const result = await perform("delete", () => deleteWorkProject(project.id), { refresh: false });
		if (result.ok) { onClose(); router.push("/work/projects"); router.refresh(); }
	};
	const leadName = draft.lead === "none" ? t("noLead") : memberName(members.find((member) => member.userId === draft.lead)) ?? tPeople("unknown");
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-lg">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{project ? t("editTitle") : t("new")}</DialogTitle>
						<DialogDescription>{t("dialogDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-name`}>{t("name")}</Label>
						<Input id={`${id}-name`} autoFocus maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="rounded-md" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-description`}>{t("descriptionLabel")}</Label>
						<Textarea id={`${id}-description`} rows={4} maxLength={20000} value={draft.description} placeholder={t("descriptionPlaceholder")} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="rounded-md" />
					</div>
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="space-y-1.5">
							<Label>{t("state")}</Label>
							<Select value={draft.state} onValueChange={(value) => setDraft({ ...draft, state: value as WorkProjectState })}>
								<SelectTrigger aria-label={t("state")} className="w-full rounded-md"><SelectValue>{t(`states.${draft.state}`)}</SelectValue></SelectTrigger>
								<SelectContent>{WORK_PROJECT_STATES.map((state) => <SelectItem key={state} value={state}>{t(`states.${state}`)}</SelectItem>)}</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label>{t("lead")}</Label>
							<Select value={draft.lead} onValueChange={(value) => setDraft({ ...draft, lead: value })}>
								<SelectTrigger aria-label={t("lead")} className="w-full rounded-md"><SelectValue>{leadName}</SelectValue></SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{t("noLead")}</SelectItem>
									{members.map((member) => <SelectItem key={member.userId} value={member.userId}>{memberName(member) ?? tPeople("unknown")}</SelectItem>)}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-target`}>{t("targetDate")}</Label>
							<Input id={`${id}-target`} type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} className="rounded-md" />
						</div>
					</div>
					{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
					{confirmDelete ? (
						<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm">
							<span>{t("deleteConfirm", { name: project?.name ?? "" })}</span>
							<span className="flex gap-2">
								<Button type="button" size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>{tCommon("cancel")}</Button>
								<Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={remove}>{tCommon("delete")}</Button>
							</span>
						</div>
					) : null}
					<DialogFooter className="sm:justify-between">
						{project ? <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" />{tCommon("delete")}</Button> : <span />}
						<span className="flex gap-2">
							<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
							<Button type="submit" disabled={busy !== null}>{busy ? tCommon("saving") : tCommon("save")}</Button>
						</span>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function ProjectDetail({ project, items, members, projects, cycles, layout }: { project: WorkProject; items: WorkItem[]; members: WorkMember[]; projects: WorkProject[]; cycles: WorkCycle[]; layout: "list" | "board" }) {
	const t = useTranslations("Work.projects");
	const tInbox = useTranslations("Work.inbox");
	const tViews = useTranslations("Work.views");
	const copy = useWorkCopy();
	const formatDay = useDayFormat();
	const [editing, setEditing] = useState(false);
	const [creating, setCreating] = useState(false);
	const board = layout === "board";
	return (
		<div className="space-y-6">
			<nav className="flex items-center gap-1 text-xs text-muted-foreground">
				<Link href="/work/projects" className="hover:text-foreground">{t("title")}</Link>
				<ChevronRight className="size-3" aria-hidden="true" />
				<span className="truncate">{project.name}</span>
			</nav>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-2">
					<h2 className="text-xl font-semibold">{project.name}</h2>
					<p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
						<span className={PROJECT_STATE_TONE[project.state]}>{t(`states.${project.state}`)}</span>
						<ProgressBar value={project.progress} label={t("progressOf", { name: project.name })} />
						<span className="tabular-nums">{t("doneOf", { done: project.doneCount, total: project.itemCount })}</span>
						{project.leadUserId ? <span className="inline-flex items-center gap-1.5">{t("lead")}: <AssigneeLabel agent={null} userId={project.leadUserId} members={members} /></span> : null}
						{project.targetDate ? <span>{t("targetOn", { date: formatDay(project.targetDate) })}</span> : null}
					</p>
				</div>
				<div className="flex gap-2">
					<Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />{t("edit")}</Button>
					<Button type="button" size="sm" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{tInbox("newItem")}</Button>
				</div>
			</div>
			{project.description ? <WorkMarkdown className="max-w-3xl">{project.description}</WorkMarkdown> : null}
			<section aria-labelledby="work-project-items" className="space-y-2">
				<div className="flex items-center justify-between gap-2">
					<h3 id="work-project-items" className="text-sm font-medium">{t("items")}</h3>
					<div role="group" aria-label={tInbox("layout")} className="flex rounded-md border p-0.5">
						<Button asChild variant={board ? "ghost" : "secondary"} size="icon-xs"><Link href={`/work/projects/${project.id}`} aria-label={tViews("layoutList")} aria-current={!board ? "true" : undefined}><List aria-hidden="true" /></Link></Button>
						<Button asChild variant={board ? "secondary" : "ghost"} size="icon-xs"><Link href={`/work/projects/${project.id}?layout=board`} aria-label={tViews("layoutBoard")} aria-current={board ? "true" : undefined}><Columns3 aria-hidden="true" /></Link></Button>
					</div>
				</div>
				{items.length ? (board ? <WorkBoard items={items} members={members} /> : (
					<ul className="divide-y rounded-md border">
						{items.map((item) => (
							<li key={item.id} className="relative flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
								<PriorityIcon priority={item.priority} label={copy.priority(item.priority)} />
								<span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{item.number}</span>
								<StateIcon state={item.state} label={copy.state(item.state)} />
								<Link href={`/work/${item.number}`} className="min-w-0 flex-1 truncate after:absolute after:inset-0">{item.title}</Link>
								<SlaBadge status={slaStatus(item)} compact />
								<AssigneeLabel agent={item.assigneeAgent} userId={item.assigneeUserId} members={members} compact />
								<TimeAgo value={item.updatedAt} className="w-24 shrink-0 text-right text-xs text-muted-foreground" />
							</li>
						))}
					</ul>
				)) : <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{t("noItems")}</p>}
			</section>
			{editing ? <ProjectDialog project={project} members={members} onClose={() => setEditing(false)} /> : null}
			<CreateItemDialog open={creating} onOpenChange={setCreating} members={members} projects={projects} cycles={cycles} projectId={project.id} />
		</div>
	);
}
