"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createWorkItem } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { normaliseGithubRepo, parseLabels } from "@/lib/work/format";
import { parseAssigneeKey } from "@/lib/work/inbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkCycle, WorkItemState, WorkMember, WorkProject } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { AssigneeSelect, PrioritySelect, StateSelect } from "./WorkSelects";

const CREATE_STATES: readonly WorkItemState[] = ["triage", "backlog", "todo", "in_progress"];

export type CreateItemDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	members: WorkMember[];
	projects?: WorkProject[];
	cycles?: WorkCycle[];
	/** Preset project, for "New item" on a project page. */
	projectId?: string | null;
};

export function CreateItemDialog({ open, onOpenChange, members, projects = [], cycles = [], projectId: presetProject = null }: CreateItemDialogProps) {
	const t = useTranslations("Work.create");
	const tItem = useTranslations("Work.item");
	const tCommon = useTranslations("Work.common");
	const router = useRouter();
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [state, setState] = useState<WorkItemState>("triage");
	const [priority, setPriority] = useState(0);
	const [assignee, setAssignee] = useState("none");
	const [labels, setLabels] = useState("");
	const [repo, setRepo] = useState("");
	const [projectId, setProjectId] = useState<string>(presetProject ?? "none");
	const [cycleId, setCycleId] = useState<string>("none");
	const [estimate, setEstimate] = useState("");
	const [error, setError] = useState<string | null>(null);

	const reset = () => {
		setTitle(""); setDescription(""); setState("triage"); setPriority(0); setAssignee("none"); setLabels(""); setRepo(""); setProjectId(presetProject ?? "none"); setCycleId("none"); setEstimate(""); setError(null);
	};

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!title.trim()) return setError(t("titleRequired"));
		const githubRepo = repo.trim() ? normaliseGithubRepo(repo) : null;
		if (repo.trim() && !githubRepo) return setError(t("repoInvalid"));
		const points = estimate.trim() ? Number(estimate) : null;
		if (points !== null && (!Number.isInteger(points) || points < 0 || points > 21)) return setError(tItem("estimateInvalid"));
		setError(null);
		const result = await perform("create", () => createWorkItem({
			title: title.trim(),
			description: description.trim() || undefined,
			state,
			priority,
			labels: parseLabels(labels),
			...parseAssigneeKey(assignee),
			githubRepo,
			...(projectId !== "none" ? { projectId } : {}),
			...(cycleId !== "none" ? { cycleId } : {}),
			...(points !== null ? { estimate: points } : {}),
		}), { refresh: false });
		if (result.ok) {
			reset();
			onOpenChange(false);
			router.push(`/work/${result.item.number}`);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
			<DialogContent className="rounded-md sm:max-w-xl">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{t("title")}</DialogTitle>
						<DialogDescription>{t("description")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-title`}>{t("titleLabel")}</Label>
						<Input id={`${id}-title`} autoFocus value={title} maxLength={300} placeholder={t("titlePlaceholder")} onChange={(event) => setTitle(event.target.value)} className="rounded-md" />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-description`}>{t("descriptionLabel")}</Label>
						<Textarea id={`${id}-description`} value={description} rows={5} maxLength={20000} placeholder={t("descriptionPlaceholder")} onChange={(event) => setDescription(event.target.value)} className="rounded-md" />
					</div>
					<div className="grid gap-3 sm:grid-cols-3">
						<StateSelect label={tItem("state")} value={state} states={CREATE_STATES} onChange={setState} />
						<PrioritySelect label={tItem("priority")} value={priority} onChange={setPriority} />
						<AssigneeSelect label={tItem("assignee")} value={assignee} members={members} onChange={setAssignee} />
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-labels`}>{t("labels")}</Label>
							<Input id={`${id}-labels`} value={labels} placeholder={tItem("labelsPlaceholder")} onChange={(event) => setLabels(event.target.value)} className="rounded-md" />
							<p className="text-xs text-muted-foreground">{t("labelsHint")}</p>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-repo`}>{t("repo")}</Label>
							<Input id={`${id}-repo`} value={repo} placeholder={t("repoPlaceholder")} onChange={(event) => setRepo(event.target.value)} className="rounded-md font-mono" />
						</div>
					</div>
					{projects.length || cycles.length ? (
						<div className="grid gap-3 sm:grid-cols-3">
							{projects.length ? (
								<Select value={projectId} onValueChange={setProjectId}>
									<SelectTrigger aria-label={tItem("project")} className="w-full rounded-md"><SelectValue>{projects.find((project) => project.id === projectId)?.name ?? tItem("noProject")}</SelectValue></SelectTrigger>
									<SelectContent>
										<SelectItem value="none">{tItem("noProject")}</SelectItem>
										{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
									</SelectContent>
								</Select>
							) : null}
							{cycles.length ? (
								<Select value={cycleId} onValueChange={setCycleId}>
									<SelectTrigger aria-label={tItem("cycle")} className="w-full rounded-md"><SelectValue>{(() => { const cycle = cycles.find((entry) => entry.id === cycleId); return cycle ? cycle.name || tItem("cycleNumber", { number: cycle.number }) : tItem("noCycle"); })()}</SelectValue></SelectTrigger>
									<SelectContent>
										<SelectItem value="none">{tItem("noCycle")}</SelectItem>
										{cycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name || tItem("cycleNumber", { number: cycle.number })}</SelectItem>)}
									</SelectContent>
								</Select>
							) : null}
							<Input type="number" min={0} max={21} inputMode="numeric" aria-label={tItem("estimate")} placeholder={tItem("estimate")} value={estimate} onChange={(event) => setEstimate(event.target.value)} className="rounded-md" />
						</div>
					) : null}
					{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
						<Button type="submit" disabled={busy !== null}>{busy ? tCommon("saving") : t("submit")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
