"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Tags, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { bulkUpdateWorkItems, type BulkWorkChanges } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseAssigneeKey } from "@/lib/work/inbox";
import { parseLabelChanges } from "@/lib/work/selection";
import { WORK_AGENTS, WORK_ITEM_STATES, WORK_PRIORITIES, type WorkCycle, type WorkMember, type WorkProject } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { PriorityIcon, StateIcon, memberName, useWorkCopy } from "./WorkBits";

/** The floating bar shown while list rows are selected. Each change applies to every selected item at once. */
export function BulkBar({ numbers, members, projects, cycles, onClear }: { numbers: number[]; members: WorkMember[]; projects: WorkProject[]; cycles: WorkCycle[]; onClear: () => void }) {
	const t = useTranslations("Work.bulk");
	const tItem = useTranslations("Work.item");
	const tPeople = useTranslations("Work.people");
	const copy = useWorkCopy();
	const { perform, busy } = useWorkAction();
	const disabled = busy !== null || !numbers.length;

	const apply = async (changes: BulkWorkChanges) => {
		const result = await perform("bulk", () => bulkUpdateWorkItems(numbers, changes));
		if (result.ok) toast.success(t("updated", { count: result.updated ?? numbers.length }));
		return result.ok;
	};

	return (
		<div role="toolbar" aria-label={t("label")} className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-md">
			<span className="text-sm font-medium tabular-nums">{t("selected", { count: numbers.length })}</span>
			<BulkSelect label={tItem("state")} disabled={disabled} onChange={(value) => apply({ state: value as (typeof WORK_ITEM_STATES)[number] })}
				options={WORK_ITEM_STATES.map((state) => ({ value: state, label: <><StateIcon state={state} />{copy.state(state)}</> }))} />
			<BulkSelect label={tItem("priority")} disabled={disabled} onChange={(value) => apply({ priority: Number(value) })}
				options={WORK_PRIORITIES.map((priority) => ({ value: String(priority), label: <><PriorityIcon priority={priority} />{copy.priority(priority)}</> }))} />
			<BulkSelect label={tItem("assignee")} disabled={disabled} onChange={(value) => apply(parseAssigneeKey(value))}
				options={[
					{ value: "none", label: tPeople("unassigned") },
					...WORK_AGENTS.map((agent) => ({ value: `agent:${agent}`, label: copy.agent(agent) })),
					...members.map((member) => ({ value: `user:${member.userId}`, label: memberName(member) ?? tPeople("unknown") })),
				]} />
			<LabelsPopover disabled={disabled} onApply={(changes) => apply(changes)} />
			{projects.length ? (
				<BulkSelect label={tItem("project")} disabled={disabled} onChange={(value) => apply({ projectId: value === "none" ? null : value })}
					options={[{ value: "none", label: tItem("noProject") }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} />
			) : null}
			{cycles.length ? (
				<BulkSelect label={tItem("cycle")} disabled={disabled} onChange={(value) => apply({ cycleId: value === "none" ? null : value })}
					options={[{ value: "none", label: tItem("noCycle") }, ...cycles.map((cycle) => ({ value: cycle.id, label: cycle.name || tItem("cycleNumber", { number: cycle.number }) }))]} />
			) : null}
			<Button type="button" variant="ghost" size="icon-sm" aria-label={t("clear")} title={t("clear")} onClick={onClear}><X aria-hidden="true" /></Button>
		</div>
	);
}

/** A select that acts once on choice and then shows its label again. */
function BulkSelect({ label, options, disabled, onChange }: { label: string; options: Array<{ value: string; label: ReactNode }>; disabled: boolean; onChange: (value: string) => void }) {
	const [value, setValue] = useState<string | null>(null);
	return (
		<Select value={value} disabled={disabled} onValueChange={(next) => { if (typeof next === "string") { setValue(null); onChange(next); } }}>
			<SelectTrigger size="sm" aria-label={label} className="w-auto rounded-md"><SelectValue placeholder={label}>{label}</SelectValue></SelectTrigger>
			<SelectContent>
				{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
			</SelectContent>
		</Select>
	);
}

function LabelsPopover({ disabled, onApply }: { disabled: boolean; onApply: (changes: Pick<BulkWorkChanges, "labelsAdd" | "labelsRemove">) => Promise<boolean> }) {
	const t = useTranslations("Work.bulk");
	const tItem = useTranslations("Work.item");
	const id = useId();
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const changes = parseLabelChanges(value);
		if (!changes.labelsAdd.length && !changes.labelsRemove.length) return;
		if (await onApply(changes)) { setValue(""); setOpen(false); }
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button type="button" variant="outline" size="sm" disabled={disabled}><Tags aria-hidden="true" />{tItem("labels")}</Button>
			</PopoverTrigger>
			<PopoverContent className="w-72 rounded-md">
				<form onSubmit={submit} className="space-y-2">
					<label htmlFor={id} className="text-xs font-medium">{t("labelsLabel")}</label>
					<Input id={id} autoFocus value={value} placeholder="+bug -billing" onChange={(event) => setValue(event.target.value)} className="h-8 rounded-md font-mono text-xs" />
					<p className="text-xs text-muted-foreground">{t("labelsHint")}</p>
					<div className="flex justify-end"><Button type="submit" size="sm">{t("apply")}</Button></div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
