"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WORK_AGENTS, WORK_ITEM_STATES, WORK_PRIORITIES, type WorkItemState, type WorkMember } from "@/lib/work/types";
import { AssigneeLabel, PriorityIcon, StateIcon, memberName, useWorkCopy } from "./WorkBits";

type Common = { disabled?: boolean; className?: string; size?: "sm" | "default"; label: string };

function Trigger({ label, className, size, children }: { label: string; className?: string; size?: "sm" | "default"; children: ReactNode }) {
	return (
		<SelectTrigger size={size} aria-label={label} className={cn("w-full justify-between rounded-md", className)}>
			<SelectValue>{children}</SelectValue>
		</SelectTrigger>
	);
}

export function StateSelect({ value, onChange, states = WORK_ITEM_STATES, ...common }: Common & { value: WorkItemState; onChange: (state: WorkItemState) => void; states?: readonly WorkItemState[] }) {
	const copy = useWorkCopy();
	return (
		<Select value={value} disabled={common.disabled} onValueChange={(next) => onChange(next as WorkItemState)}>
			<Trigger label={common.label} className={common.className} size={common.size}><StateIcon state={value} />{copy.state(value)}</Trigger>
			<SelectContent>
				{states.map((state) => <SelectItem key={state} value={state}><StateIcon state={state} />{copy.state(state)}</SelectItem>)}
			</SelectContent>
		</Select>
	);
}

export function PrioritySelect({ value, onChange, ...common }: Common & { value: number; onChange: (priority: number) => void }) {
	const copy = useWorkCopy();
	return (
		<Select value={String(value)} disabled={common.disabled} onValueChange={(next) => onChange(Number(next))}>
			<Trigger label={common.label} className={common.className} size={common.size}><PriorityIcon priority={value} />{copy.priority(value)}</Trigger>
			<SelectContent>
				{WORK_PRIORITIES.map((priority) => <SelectItem key={priority} value={String(priority)}><PriorityIcon priority={priority} />{copy.priority(priority)}</SelectItem>)}
			</SelectContent>
		</Select>
	);
}

/** Value is "none", "agent:<agent>" or "user:<id>". */
export function AssigneeSelect({ value, onChange, members, ...common }: Common & { value: string; onChange: (value: string) => void; members: WorkMember[] }) {
	const t = useTranslations("Work.people");
	const agent = value.startsWith("agent:") ? (value.slice(6) as (typeof WORK_AGENTS)[number]) : null;
	const userId = value.startsWith("user:") ? value.slice(5) : null;
	return (
		<Select value={value} disabled={common.disabled} onValueChange={onChange}>
			<Trigger label={common.label} className={common.className} size={common.size}><AssigneeLabel agent={agent} userId={userId} members={members} /></Trigger>
			<SelectContent>
				<SelectItem value="none">{t("unassigned")}</SelectItem>
				<SelectSeparator />
				<SelectGroup>
					<SelectLabel>{t("agentsGroup")}</SelectLabel>
					{WORK_AGENTS.map((name) => <SelectItem key={name} value={`agent:${name}`}><AssigneeLabel agent={name} userId={null} members={members} /></SelectItem>)}
				</SelectGroup>
				{members.length ? (
					<SelectGroup>
						<SelectLabel>{t("peopleGroup")}</SelectLabel>
						{members.map((member) => (
							<SelectItem key={member.userId} value={`user:${member.userId}`}>
								<AssigneeLabel agent={null} userId={member.userId} members={members} />
								{member.email && member.email !== memberName(member) ? <span className="truncate text-xs text-muted-foreground">{member.email}</span> : null}
							</SelectItem>
						))}
					</SelectGroup>
				) : null}
			</SelectContent>
		</Select>
	);
}

/** A plain select with an "all" option, for list filters. */
export function FilterSelect({ value, onChange, allLabel, options, ...common }: Common & { value: string; onChange: (value: string) => void; allLabel: string; options: Array<{ value: string; label: ReactNode }> }) {
	const selected = options.find((option) => option.value === value);
	return (
		<Select value={value} disabled={common.disabled} onValueChange={onChange}>
			<Trigger label={common.label} size={common.size} className={cn("w-auto min-w-32", value !== "all" && "bg-muted", common.className)}>{selected?.label ?? allLabel}</Trigger>
			<SelectContent>
				<SelectItem value="all">{allLabel}</SelectItem>
				{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
			</SelectContent>
		</Select>
	);
}
