"use client";

import { useId, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createWorkMilestone, deleteProjectUpdate, deleteWorkMilestone, postProjectUpdate, updateWorkMilestone } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PROJECT_HEALTHS, type ProjectHealth, type ProjectUpdate, type WorkMember, type WorkMilestone } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { AssigneeLabel, ProgressBar, TimeAgo } from "./WorkBits";
import { WorkMarkdown } from "./WorkMarkdown";

export const HEALTH_TONE: Record<ProjectHealth, string> = {
	on_track: "text-emerald-700 dark:text-emerald-300",
	at_risk: "text-amber-700 dark:text-amber-300",
	off_track: "text-red-700 dark:text-red-300",
};

/** A project's health as coloured text, with a dot for people who don't read colour. */
export function HealthLabel({ health }: { health: ProjectHealth }) {
	const t = useTranslations("Work.projectUpdates");
	return (
		<span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", HEALTH_TONE[health])}>
			<span aria-hidden="true" className="size-1.5 rounded-md bg-current" />
			{t(`health.${health}`)}
		</span>
	);
}

export function ProjectMilestones({ projectId, milestones, formatDay }: { projectId: string; milestones: WorkMilestone[]; formatDay: (value: string | null | undefined) => string }) {
	const t = useTranslations("Work.milestones");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [name, setName] = useState("");
	const [targetDate, setTargetDate] = useState("");
	const add = async (event: FormEvent) => {
		event.preventDefault();
		if (!name.trim()) return;
		const result = await perform("milestone", () => createWorkMilestone(projectId, { name: name.trim(), targetDate: targetDate || null }));
		if (result.ok) { setName(""); setTargetDate(""); }
	};
	return (
		<section aria-labelledby={`${id}-title`} className="space-y-2">
			<h3 id={`${id}-title`} className="text-sm font-medium">{t("title")}</h3>
			{milestones.length ? (
				<ul className="divide-y rounded-md border text-sm">
					{milestones.map((milestone) => {
						const progress = milestone.itemCount ? milestone.doneCount / milestone.itemCount : 0;
						return (
							<li key={milestone.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
								<span className="min-w-0 flex-1 truncate font-medium">{milestone.name}</span>
								<ProgressBar value={progress} label={t("progressOf", { name: milestone.name })} />
								<span className="text-xs tabular-nums text-muted-foreground">{t("doneOf", { done: milestone.doneCount, total: milestone.itemCount })}</span>
								<Input type="date" aria-label={t("targetDateFor", { name: milestone.name })} defaultValue={milestone.targetDate ?? ""} disabled={busy !== null}
									onBlur={(event) => { const value = event.target.value; if ((value || null) !== milestone.targetDate) void perform("milestone-date", () => updateWorkMilestone(milestone.id, { targetDate: value || null })); }}
									className="h-7 w-36 rounded-md text-xs" />
								<span className="w-24 text-xs text-muted-foreground">{milestone.targetDate ? formatDay(milestone.targetDate) : t("noDate")}</span>
								<Button type="button" variant="ghost" size="icon-sm" disabled={busy !== null} aria-label={`${tCommon("delete")}: ${milestone.name}`}
									onClick={() => { if (window.confirm(t("deleteConfirm", { name: milestone.name }))) void perform("milestone-delete", () => deleteWorkMilestone(milestone.id)); }}>
									<Trash2 aria-hidden="true" />
								</Button>
							</li>
						);
					})}
				</ul>
			) : <p className="text-xs text-muted-foreground">{t("empty")}</p>}
			<form onSubmit={add} className="flex flex-wrap items-end gap-2">
				<div className="min-w-48 flex-1 space-y-1 sm:max-w-xs">
					<Label htmlFor={`${id}-name`} className="sr-only">{t("name")}</Label>
					<Input id={`${id}-name`} value={name} maxLength={120} placeholder={t("namePlaceholder")} onChange={(event) => setName(event.target.value)} className="h-8 rounded-md text-sm" />
				</div>
				<div className="space-y-1">
					<Label htmlFor={`${id}-date`} className="sr-only">{t("targetDate")}</Label>
					<Input id={`${id}-date`} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="h-8 w-40 rounded-md text-sm" />
				</div>
				<Button type="submit" size="sm" disabled={busy !== null || !name.trim()}>{t("add")}</Button>
			</form>
		</section>
	);
}

export function ProjectUpdates({ projectId, updates, members, currentUserId, canManageAll }: { projectId: string; updates: ProjectUpdate[]; members: WorkMember[]; currentUserId: string | null; canManageAll: boolean }) {
	const t = useTranslations("Work.projectUpdates");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [health, setHealth] = useState<ProjectHealth>(updates[0]?.health ?? "on_track");
	const [body, setBody] = useState("");
	const post = async (event: FormEvent) => {
		event.preventDefault();
		if (!body.trim()) return;
		const result = await perform("update", () => postProjectUpdate(projectId, { health, body: body.trim() }));
		if (result.ok) setBody("");
	};
	return (
		<section aria-labelledby={`${id}-title`} className="space-y-3">
			<h3 id={`${id}-title`} className="text-sm font-medium">{t("title")}</h3>
			<form onSubmit={post} className="space-y-2 rounded-md border p-3">
				<div className="flex flex-wrap items-center gap-2">
					<Label htmlFor={`${id}-health`} className="text-xs text-muted-foreground">{t("healthLabel")}</Label>
					<Select value={health} onValueChange={(value) => setHealth(value as ProjectHealth)}>
						<SelectTrigger id={`${id}-health`} size="sm" className="w-40 rounded-md"><SelectValue><HealthLabel health={health} /></SelectValue></SelectTrigger>
						<SelectContent>{PROJECT_HEALTHS.map((value) => <SelectItem key={value} value={value}><HealthLabel health={value} /></SelectItem>)}</SelectContent>
					</Select>
				</div>
				<Label htmlFor={`${id}-body`} className="sr-only">{t("bodyLabel")}</Label>
				<Textarea id={`${id}-body`} rows={3} maxLength={10000} value={body} placeholder={t("bodyPlaceholder")} onChange={(event) => setBody(event.target.value)} className="rounded-md text-sm" />
				<div className="flex justify-end"><Button type="submit" size="sm" disabled={busy !== null || !body.trim()}>{t("post")}</Button></div>
			</form>
			{updates.length ? (
				<ol className="space-y-3">
					{updates.map((update) => (
						<li key={update.id} className="rounded-md border">
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-xs text-muted-foreground">
								<HealthLabel health={update.health} />
								{update.authorUserId ? <AssigneeLabel agent={null} userId={update.authorUserId} members={members} compact /> : null}
								<TimeAgo value={update.createdAt} />
								{canManageAll || update.authorUserId === currentUserId ? (
									<Button type="button" variant="ghost" size="icon-xs" className="ml-auto" disabled={busy !== null} aria-label={tCommon("delete")}
										onClick={() => { if (window.confirm(t("deleteConfirm"))) void perform("update-delete", () => deleteProjectUpdate(update.id)); }}>
										<Trash2 aria-hidden="true" />
									</Button>
								) : null}
							</div>
							<WorkMarkdown className="px-3 py-2">{update.body}</WorkMarkdown>
						</li>
					))}
				</ol>
			) : <p className="text-xs text-muted-foreground">{t("empty")}</p>}
		</section>
	);
}
