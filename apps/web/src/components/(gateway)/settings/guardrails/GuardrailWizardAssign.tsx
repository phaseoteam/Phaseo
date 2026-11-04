"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingsGuardrailRow } from "@/lib/fetchers/internal/settingsTypes";
import { SettingsResourceQuery } from "../PrivateSettingsQuery";
import { accessSummaryParts } from "./GuardrailAssignmentsPanel";
import { matchesAssignmentQuery, type AssignmentTargetType, type EffectiveGuardrailPolicy } from "./guardrailAssignments";
import { buildWizardAssignRows, type WizardAssignRow } from "./guardrailWizard";

/**
 * Step 3 of the new-guardrail flow: pick the keys and members it applies to, and see for each one
 * what its guardrails add up to now and with the new one, before anything is saved.
 */
export default function GuardrailWizardAssign(props: {
	draft: SettingsGuardrailRow;
	keyIds: string[];
	memberIds: string[];
	onChange: (next: { keyIds: string[]; memberIds: string[] }) => void;
}) {
	return (
		<SettingsResourceQuery resource="guardrails">
			{(data) => (
				<AssignTable
					{...props}
					keys={data.keys}
					members={data.members}
					guardrails={data.guardrails}
					guardrailKeyIdsByGuardrailId={data.guardrailKeyIdsByGuardrailId}
					guardrailMemberIdsByGuardrailId={data.guardrailMemberIdsByGuardrailId}
				/>
			)}
		</SettingsResourceQuery>
	);
}

function AssignTable(props: Parameters<typeof GuardrailWizardAssign>[0] & Omit<Parameters<typeof buildWizardAssignRows>[0], "targetType" | "draft" | "keyIds" | "memberIds" | "untitled">) {
	const t = useTranslations("SettingsUI");
	const [targetType, setTargetType] = useState<AssignmentTargetType>("key");
	const [query, setQuery] = useState("");
	const rows = useMemo(() => buildWizardAssignRows({
		targetType,
		keys: props.keys,
		members: props.members,
		guardrails: props.guardrails,
		guardrailKeyIdsByGuardrailId: props.guardrailKeyIdsByGuardrailId,
		guardrailMemberIdsByGuardrailId: props.guardrailMemberIdsByGuardrailId,
		draft: props.draft,
		keyIds: props.keyIds,
		memberIds: props.memberIds,
		untitled: t("guardrailsControls.untitled"),
	}), [targetType, props.keys, props.members, props.guardrails, props.guardrailKeyIdsByGuardrailId, props.guardrailMemberIdsByGuardrailId, props.draft, props.keyIds, props.memberIds, t]);
	const visibleRows = useMemo(() => rows.filter((row) => matchesAssignmentQuery(row, query)), [rows, query]);
	const selectedIds = targetType === "key" ? props.keyIds : props.memberIds;
	const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => row.selected);
	const someVisibleSelected = visibleRows.some((row) => row.selected);
	const coveredKeyCount = useMemo(() => {
		if (!props.memberIds.length) return 0;
		const members = new Set(props.memberIds);
		const keys = new Set(props.keyIds);
		return props.keys.filter((key) => key.principalUserId && members.has(key.principalUserId) && !keys.has(key.id)).length;
	}, [props.keyIds, props.keys, props.memberIds]);

	function setSelected(ids: Iterable<string>, checked: boolean) {
		const next = new Set(selectedIds);
		for (const id of ids) {
			if (checked) next.add(id);
			else next.delete(id);
		}
		const list = [...next];
		props.onChange(targetType === "key" ? { keyIds: list, memberIds: props.memberIds } : { keyIds: props.keyIds, memberIds: list });
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-3">
				<Tabs value={targetType} onValueChange={(value) => { setTargetType(value === "member" ? "member" : "key"); setQuery(""); }}>
					<TabsList>
						<TabsTrigger value="key">
							{t("guardrailAssignments.keysView")}
							<span className="text-muted-foreground">{props.keyIds.length ? `${props.keyIds.length}/${props.keys.length}` : props.keys.length}</span>
						</TabsTrigger>
						<TabsTrigger value="member">
							{t("guardrailAssignments.membersView")}
							<span className="text-muted-foreground">{props.memberIds.length ? `${props.memberIds.length}/${props.members.length}` : props.members.length}</span>
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="relative min-w-0 flex-1 sm:max-w-xs">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={t("guardrailAssignments.search")}
						aria-label={t("guardrailAssignments.search")}
						className="h-8 rounded-md pl-8"
					/>
				</div>
			</div>

			<div className="overflow-x-auto rounded-md border bg-background">
				<Table wrapInContainer={false} className="min-w-[760px] table-fixed [&_tr:last-child]:border-b-0 [&_th]:px-3 [&_td]:px-3 [&_td]:align-middle">
					<TableHeader className="bg-muted/30">
						<TableRow>
							<TableHead className="w-10">
								<Checkbox
									checked={allVisibleSelected}
									indeterminate={someVisibleSelected && !allVisibleSelected}
									disabled={!visibleRows.length}
									onCheckedChange={(checked) => setSelected(visibleRows.map((row) => row.id), checked === true)}
									aria-label={t("guardrailAssignments.selectAll")}
								/>
							</TableHead>
							<TableHead className="w-[26%]">
								{t(targetType === "key" ? "guardrailAssignments.columnKey" : "guardrailAssignments.columnMember")}
							</TableHead>
							<TableHead className="w-[30%]">{t("guardrailWizard.columnNow")}</TableHead>
							<TableHead>{t("guardrailWizard.columnAfter")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleRows.length ? visibleRows.map((row) => (
							<TableRow key={row.id} data-state={row.selected ? "selected" : undefined}>
								<TableCell>
									<Checkbox
										checked={row.selected}
										onCheckedChange={(checked) => setSelected([row.id], checked === true)}
										aria-label={t("guardrailAssignments.selectRow", { name: row.name })}
									/>
								</TableCell>
								<TableCell>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="truncate text-sm font-medium" title={row.name}>{row.name}</span>
											{row.status && row.status !== "active" ? <Badge variant="outline" className="capitalize">{row.status}</Badge> : null}
										</div>
										<div className={row.type === "key" ? "truncate font-mono text-xs text-muted-foreground" : "truncate text-xs capitalize text-muted-foreground"}>
											{row.detail}
										</div>
									</div>
								</TableCell>
								<TableCell>
									<div className="min-w-0 space-y-1">
										{row.guardrails.length ? (
											<div className="flex min-w-0 flex-wrap gap-1">
												{row.guardrails.map((guardrail) => (
													<Badge key={guardrail.id} variant={guardrail.source === "member" ? "secondary" : "outline"} className={guardrail.enabled ? "max-w-full" : "max-w-full opacity-60"}>
														<span className="truncate">{guardrail.name}</span>
													</Badge>
												))}
											</div>
										) : null}
										<PolicyLine policy={row.effective} />
									</div>
								</TableCell>
								<TableCell>
									<AfterCell row={row} />
								</TableCell>
							</TableRow>
						)) : (
							<TableRow>
								<TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
									{query.trim()
										? t("guardrailAssignments.noMatches")
										: t(targetType === "key" ? "guardrailAssignments.noKeys" : "guardrailAssignments.noMembers")}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<p className="text-xs text-muted-foreground">
				{props.keyIds.length || props.memberIds.length
					? t("guardrailWizard.assignTotals", { keys: props.keyIds.length, members: props.memberIds.length })
					: t("guardrailWizard.assignNone")}
				{coveredKeyCount ? ` ${t("guardrailWizard.coveredKeys", { count: coveredKeyCount })}` : null}
				{" "}
				{t("guardrailWizard.assignMemberHint")}
			</p>
		</div>
	);
}

function AfterCell({ row }: { row: WizardAssignRow }) {
	const t = useTranslations("SettingsUI");
	if (!row.after) return <span className="text-sm text-muted-foreground">{t("guardrailWizard.notApplied")}</span>;
	return (
		<div className="min-w-0 space-y-1">
			<div className="flex items-start gap-1.5">
				<ArrowRight className={row.changes ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" : "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"} aria-hidden="true" />
				<PolicyLine policy={row.after} emphasis={row.changes} />
			</div>
			{row.coveredVia && !row.selected ? (
				<p className="text-xs text-muted-foreground">{t("guardrailWizard.coveredVia", { name: row.coveredVia.name })}</p>
			) : null}
			{!row.changes ? <p className="text-xs text-muted-foreground">{t("guardrailWizard.noTighter")}</p> : null}
		</div>
	);
}

/** Access, prompt injection and sensitive info on one line, e.g. "ZDR only · Prompt injection: Block · 4 sensitive info rules". */
function PolicyLine({ policy, emphasis = false }: { policy: EffectiveGuardrailPolicy; emphasis?: boolean }) {
	const t = useTranslations("SettingsUI");
	const parts = accessSummaryParts(policy, t);
	if (policy.promptInjection) parts.push(t("guardrailWizard.promptInjectionPart", { action: t(`guardrailsControls.${policy.promptInjection}`) }));
	if (policy.sensitiveInfoRuleCount) parts.push(t("guardrailWizard.sensitiveInfoPart", { count: policy.sensitiveInfoRuleCount }));
	if (!parts.length) return <span className="text-sm text-muted-foreground">{t("guardrailAssignments.noLimits")}</span>;
	return <span className={emphasis ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{parts.join(" · ")}</span>;
}
