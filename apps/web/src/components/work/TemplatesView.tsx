"use client";

import { useId, useState, type FormEvent } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createWorkRecurrence, createWorkTemplate, deleteWorkRecurrence, deleteWorkTemplate, updateWorkRecurrence, updateWorkTemplate, type WorkTemplateInput } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseLabels } from "@/lib/work/format";
import { RECURRENCE_CADENCES, WORK_AGENTS, type RecurrenceCadence, type WorkAgent, type WorkProject, type WorkRecurrence, type WorkTemplate } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { PrioritySelect } from "./WorkSelects";
import { TimeAgo, useWorkCopy } from "./WorkBits";

export function TemplatesView({ templates, recurrences, projects }: { templates: WorkTemplate[]; recurrences: WorkRecurrence[]; projects: WorkProject[] }) {
	const t = useTranslations("Work.templates");
	const tCommon = useTranslations("Work.common");
	const copy = useWorkCopy();
	const { perform, busy } = useWorkAction();
	const [editing, setEditing] = useState<WorkTemplate | "new" | null>(null);
	const [scheduling, setScheduling] = useState<WorkTemplate | null>(null);
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("description")}</p>
				</div>
				<Button type="button" size="sm" onClick={() => setEditing("new")}><Plus aria-hidden="true" />{t("new")}</Button>
			</div>
			{templates.length ? (
				<ul className="divide-y rounded-md border">
					{templates.map((template) => {
						const schedules = recurrences.filter((recurrence) => recurrence.templateId === template.id);
						return (
							<li key={template.id} className="space-y-2 px-3 py-2.5">
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{template.name}</p>
										<p className="truncate text-xs text-muted-foreground">
											{[template.title, template.priority ? copy.priority(template.priority) : null, template.labels.join(", ") || null, template.assigneeAgent ? t(`agents.${template.assigneeAgent}`) : null].filter(Boolean).join(" · ")}
										</p>
									</div>
									<Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={() => setScheduling(template)}><Repeat aria-hidden="true" />{t("repeat")}</Button>
									<Button type="button" variant="ghost" size="icon-sm" aria-label={t("editNamed", { name: template.name })} onClick={() => setEditing(template)}><Pencil aria-hidden="true" /></Button>
									<Button type="button" variant="ghost" size="icon-sm" disabled={busy !== null} aria-label={`${tCommon("delete")}: ${template.name}`}
										onClick={() => { if (window.confirm(t("deleteConfirm", { name: template.name }))) void perform("delete", () => deleteWorkTemplate(template.id)); }}>
										<Trash2 aria-hidden="true" />
									</Button>
								</div>
								{schedules.length ? (
									<ul className="space-y-1 pl-3">
										{schedules.map((recurrence) => (
											<li key={recurrence.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
												<Repeat className="size-3" aria-hidden="true" />
												<span className="text-foreground">{t(`cadences.${recurrence.cadence}`)}</span>
												<span>{recurrence.enabled ? t("nextRun") : t("paused")} {recurrence.enabled ? <TimeAgo value={recurrence.nextRunAt} /> : null}</span>
												<label className="ml-auto inline-flex items-center gap-1.5">
													<Switch size="sm" checked={recurrence.enabled} disabled={busy !== null} onCheckedChange={(enabled) => void perform("toggle", () => updateWorkRecurrence(recurrence.id, { enabled: Boolean(enabled) }))} />
													{tCommon("enabled")}
												</label>
												<Button type="button" variant="ghost" size="icon-xs" disabled={busy !== null} aria-label={t("stopRepeating")}
													onClick={() => void perform("recurrence-delete", () => deleteWorkRecurrence(recurrence.id))}>
													<Trash2 aria-hidden="true" />
												</Button>
											</li>
										))}
									</ul>
								) : null}
							</li>
						);
					})}
				</ul>
			) : <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>}
			{editing ? <TemplateDialog template={editing === "new" ? null : editing} projects={projects} onClose={() => setEditing(null)} /> : null}
			{scheduling ? <RepeatDialog template={scheduling} onClose={() => setScheduling(null)} /> : null}
		</div>
	);
}

function TemplateDialog({ template, projects, onClose }: { template: WorkTemplate | null; projects: WorkProject[]; onClose: () => void }) {
	const t = useTranslations("Work.templates");
	const tCommon = useTranslations("Work.common");
	const tItem = useTranslations("Work.item");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [draft, setDraft] = useState({
		name: template?.name ?? "",
		title: template?.title ?? "",
		description: template?.description ?? "",
		priority: template?.priority ?? 0,
		labels: template?.labels.join(", ") ?? "",
		estimate: typeof template?.estimate === "number" ? String(template.estimate) : "",
		projectId: template?.projectId ?? "none",
		agent: (template?.assigneeAgent ?? "none") as WorkAgent | "none",
	});
	const [error, setError] = useState<string | null>(null);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!draft.name.trim()) return setError(t("nameRequired"));
		const estimate = draft.estimate.trim() ? Number(draft.estimate) : null;
		if (estimate !== null && (!Number.isInteger(estimate) || estimate < 0 || estimate > 21)) return setError(tItem("estimateInvalid"));
		setError(null);
		const input: WorkTemplateInput = {
			name: draft.name.trim(),
			title: draft.title.trim(),
			description: draft.description.trim(),
			priority: draft.priority,
			labels: parseLabels(draft.labels),
			estimate,
			projectId: draft.projectId === "none" ? null : draft.projectId,
			assigneeAgent: draft.agent === "none" ? null : draft.agent,
		};
		const result = await perform("template", () => (template ? updateWorkTemplate(template.id, input) : createWorkTemplate(input)));
		if (result.ok) onClose();
	};
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-lg">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{template ? t("editTitle") : t("new")}</DialogTitle>
						<DialogDescription>{t("dialogDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-name`}>{t("name")}</Label>
						<Input id={`${id}-name`} autoFocus maxLength={80} value={draft.name} placeholder={t("namePlaceholder")} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="rounded-md" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-title`}>{t("itemTitle")}</Label>
						<Input id={`${id}-title`} maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="rounded-md" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-description`}>{t("itemDescription")}</Label>
						<Textarea id={`${id}-description`} rows={5} maxLength={20000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="rounded-md" />
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<PrioritySelect label={tItem("priority")} value={draft.priority} onChange={(priority) => setDraft({ ...draft, priority })} />
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-labels`}>{t("labels")}</Label>
							<Input id={`${id}-labels`} value={draft.labels} placeholder="bug, billing" onChange={(event) => setDraft({ ...draft, labels: event.target.value })} className="rounded-md" />
						</div>
						<div className="space-y-1.5">
							<Label>{tItem("project")}</Label>
							<Select value={draft.projectId} onValueChange={(projectId) => setDraft({ ...draft, projectId })}>
								<SelectTrigger aria-label={tItem("project")} className="w-full rounded-md"><SelectValue>{projects.find((project) => project.id === draft.projectId)?.name ?? tItem("noProject")}</SelectValue></SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{tItem("noProject")}</SelectItem>
									{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label>{t("agent")}</Label>
							<Select value={draft.agent} onValueChange={(agent) => setDraft({ ...draft, agent: agent as WorkAgent | "none" })}>
								<SelectTrigger aria-label={t("agent")} className="w-full rounded-md"><SelectValue>{draft.agent === "none" ? t("noAgent") : t(`agents.${draft.agent}`)}</SelectValue></SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{t("noAgent")}</SelectItem>
									{WORK_AGENTS.map((agent) => <SelectItem key={agent} value={agent}>{t(`agents.${agent}`)}</SelectItem>)}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-estimate`}>{tItem("estimate")}</Label>
							<Input id={`${id}-estimate`} inputMode="numeric" value={draft.estimate} placeholder={tItem("estimatePlaceholder")} onChange={(event) => setDraft({ ...draft, estimate: event.target.value })} className="rounded-md" />
						</div>
					</div>
					{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
						<Button type="submit" disabled={busy !== null}>{busy ? tCommon("saving") : tCommon("save")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function RepeatDialog({ template, onClose }: { template: WorkTemplate; onClose: () => void }) {
	const t = useTranslations("Work.templates");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [cadence, setCadence] = useState<RecurrenceCadence>("weekly");
	const [start, setStart] = useState("");
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const startAt = start ? new Date(start).toISOString() : null;
		const result = await perform("repeat", () => createWorkRecurrence({ templateId: template.id, cadence, startAt }));
		if (result.ok) onClose();
	};
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-md">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{t("repeatTitle", { name: template.name })}</DialogTitle>
						<DialogDescription>{t("repeatDescription")}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label>{t("cadence")}</Label>
							<Select value={cadence} onValueChange={(value) => setCadence(value as RecurrenceCadence)}>
								<SelectTrigger aria-label={t("cadence")} className="w-full rounded-md"><SelectValue>{t(`cadences.${cadence}`)}</SelectValue></SelectTrigger>
								<SelectContent>{RECURRENCE_CADENCES.map((value) => <SelectItem key={value} value={value}>{t(`cadences.${value}`)}</SelectItem>)}</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-start`}>{t("firstOn")}</Label>
							<Input id={`${id}-start`} type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className="rounded-md" />
						</div>
					</div>
					<p className="text-xs text-muted-foreground">{t("firstOnHint")}</p>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
						<Button type="submit" disabled={busy !== null}>{t("startRepeating")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
