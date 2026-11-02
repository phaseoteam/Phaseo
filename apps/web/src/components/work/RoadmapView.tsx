"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { createWorkInitiative, deleteWorkInitiative, updateWorkInitiative } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { barPosition, roadmapRange, todayPosition } from "@/lib/work/roadmap";
import { INITIATIVE_STATES, type InitiativeState, type RoadmapProject, type WorkInitiative } from "@/lib/work/types";
import { HEALTH_TONE, HealthLabel } from "./ProjectExtras";
import { useDayFormat } from "./ProjectsView";
import { useWorkAction } from "./useWorkAction";

const BAR_TONE: Record<string, string> = {
	on_track: "bg-emerald-500/70",
	at_risk: "bg-amber-500/70",
	off_track: "bg-red-500/70",
	none: "bg-sky-500/60",
};

export function RoadmapView({ initiatives, projects }: { initiatives: WorkInitiative[]; projects: RoadmapProject[] }) {
	const t = useTranslations("Work.roadmap");
	const format = useFormatter();
	const formatDay = useDayFormat();
	const [editing, setEditing] = useState<WorkInitiative | "new" | null>(null);
	const range = useMemo(() => roadmapRange(projects), [projects]);
	const today = todayPosition(range);
	const groups = [
		...initiatives.map((initiative) => ({ key: initiative.id, initiative, projects: projects.filter((project) => project.initiativeId === initiative.id) })),
		{ key: "none", initiative: null, projects: projects.filter((project) => !project.initiativeId || !initiatives.some((initiative) => initiative.id === project.initiativeId)) },
	].filter((group) => group.initiative || group.projects.length);
	const undated = projects.filter((project) => !project.targetDate);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("description")}</p>
				</div>
				<Button type="button" size="sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" />{t("newInitiative")}</Button>
			</div>
			{groups.length ? (
				<div className="overflow-x-auto rounded-md border">
					<div className="min-w-[48rem]">
						<div className="grid grid-cols-[14rem_minmax(0,1fr)] border-b text-xs text-muted-foreground">
							<div className="px-3 py-2">{t("project")}</div>
							<div className="relative flex">
								{range.months.map((month) => (
									<div key={month.key} className="flex-1 border-l px-1.5 py-2 first:border-l-0">{format.dateTime(month.label, { month: "short", year: month.label.getUTCMonth() === 0 || month === range.months[0] ? "numeric" : undefined, timeZone: "UTC" })}</div>
								))}
							</div>
						</div>
						{groups.map((group) => (
							<div key={group.key} className="border-b last:border-b-0">
								<div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 text-sm">
									<span className="font-medium">{group.initiative?.name ?? t("noInitiative")}</span>
									{group.initiative ? <span className="text-xs text-muted-foreground">{t(`states.${group.initiative.state}`)}{group.initiative.targetDate ? ` · ${t("target", { date: formatDay(group.initiative.targetDate) })}` : ""}</span> : null}
									{group.initiative ? <Button type="button" variant="ghost" size="icon-xs" className="ml-auto" aria-label={t("editNamed", { name: group.initiative.name })} onClick={() => setEditing(group.initiative)}><Pencil aria-hidden="true" /></Button> : null}
								</div>
								{group.projects.length ? group.projects.map((project) => {
									const bar = barPosition(project, range);
									return (
										<div key={project.id} className="grid grid-cols-[14rem_minmax(0,1fr)] items-center text-sm">
											<div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
												<Link href={`/work/projects/${project.id}`} className="truncate hover:underline">{project.name}</Link>
												{project.health ? <span className={cn("text-xs", HEALTH_TONE[project.health])} aria-hidden="true">●</span> : null}
											</div>
											<div className="relative h-8">
												<span aria-hidden="true" className="absolute inset-y-0 w-px bg-red-500/60" style={{ left: `${today}%` }} />
												{bar ? (
													<span
														title={`${project.name}: ${formatDay(project.startDate ?? project.createdAt)} – ${formatDay(project.targetDate)}`}
														className={cn("absolute top-1.5 h-5 rounded-md", BAR_TONE[project.health ?? "none"])}
														style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
													>
														<span className="sr-only">{t("barLabel", { name: project.name, start: formatDay(project.startDate ?? project.createdAt), end: formatDay(project.targetDate), progress: Math.round(project.progress * 100) })}</span>
														<span aria-hidden="true" className="block h-full rounded-md bg-foreground/20" style={{ width: `${Math.round(project.progress * 100)}%` }} />
													</span>
												) : <span className="absolute inset-y-0 left-2 flex items-center text-xs text-muted-foreground">{t("noTarget")}</span>}
											</div>
										</div>
									);
								}) : <p className="px-3 py-2 text-xs text-muted-foreground">{t("noProjects")}</p>}
							</div>
						))}
					</div>
				</div>
			) : <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>}
			<p className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
				<span>{t("legend")}</span>
				<HealthLabel health="on_track" /><HealthLabel health="at_risk" /><HealthLabel health="off_track" />
				<span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-px bg-red-500/60" />{t("today")}</span>
			</p>
			{undated.length ? <p className="text-xs text-muted-foreground">{t("undatedHint", { count: undated.length })}</p> : null}
			{editing ? <InitiativeDialog initiative={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
		</div>
	);
}

function InitiativeDialog({ initiative, onClose }: { initiative: WorkInitiative | null; onClose: () => void }) {
	const t = useTranslations("Work.roadmap");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [draft, setDraft] = useState({ name: initiative?.name ?? "", description: initiative?.description ?? "", state: (initiative?.state ?? "active") as InitiativeState, targetDate: initiative?.targetDate?.slice(0, 10) ?? "" });
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!draft.name.trim()) return;
		const input = { name: draft.name.trim(), description: draft.description.trim(), state: draft.state, targetDate: draft.targetDate || null };
		const result = await perform("initiative", () => (initiative ? updateWorkInitiative(initiative.id, input) : createWorkInitiative(input)));
		if (result.ok) onClose();
	};
	const remove = async () => {
		if (!initiative || !window.confirm(t("deleteConfirm", { name: initiative.name }))) return;
		const result = await perform("initiative-delete", () => deleteWorkInitiative(initiative.id));
		if (result.ok) onClose();
	};
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-lg">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{initiative ? t("editInitiative") : t("newInitiative")}</DialogTitle>
						<DialogDescription>{t("initiativeDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-name`}>{t("name")}</Label>
						<Input id={`${id}-name`} autoFocus maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="rounded-md" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-description`}>{t("goal")}</Label>
						<Textarea id={`${id}-description`} rows={3} maxLength={20000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="rounded-md" />
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label>{t("state")}</Label>
							<Select value={draft.state} onValueChange={(value) => setDraft({ ...draft, state: value as InitiativeState })}>
								<SelectTrigger aria-label={t("state")} className="w-full rounded-md"><SelectValue>{t(`states.${draft.state}`)}</SelectValue></SelectTrigger>
								<SelectContent>{INITIATIVE_STATES.map((state) => <SelectItem key={state} value={state}>{t(`states.${state}`)}</SelectItem>)}</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-target`}>{t("targetDate")}</Label>
							<Input id={`${id}-target`} type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} className="rounded-md" />
						</div>
					</div>
					<DialogFooter className="sm:justify-between">
						{initiative ? <Button type="button" variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => void remove()}><Trash2 aria-hidden="true" />{tCommon("delete")}</Button> : <span />}
						<span className="flex gap-2">
							<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
							<Button type="submit" disabled={busy !== null || !draft.name.trim()}>{busy ? tCommon("saving") : tCommon("save")}</Button>
						</span>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
