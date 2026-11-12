import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingsGuardrailRow, SettingsGuardrailsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { SettingsResourceQuery } from "../PrivateSettingsQuery";
import { accessSummaryParts, rateSummaryParts, spendSummaryParts, useSourceLabel } from "./GuardrailAssignmentsPanel";
import {
	matchesAssignmentQuery,
	workspaceAssignmentMap,
	type AssignmentTargetType,
	type EffectiveGuardrailPolicy,
} from "./guardrailAssignments";
import { buildWizardAssignRows, type WizardAssignRow, type WizardSelection } from "./guardrailWizard";

type Props = {
	draft: SettingsGuardrailRow;
	selection: WizardSelection;
	onChange: (next: WizardSelection) => void;
};

/**
 * Step 3 of the new-guardrail flow: pick the whole workspace, or departments, members and keys, and
 * see for each one what its guardrails add up to now and with the new one, before anything is saved.
 */
export default function GuardrailWizardAssign(props: Props) {
	return (
		<SettingsResourceQuery resource="guardrails">
			{(data) => <WizardAssign {...props} data={data} />}
		</SettingsResourceQuery>
	);
}

/** The assign step with its data already loaded; also what local previews render. */
export function WizardAssign(props: Props & { data: SettingsGuardrailsInitialData }) {
	const t = useTranslations("SettingsUI");
	const { data, selection } = props;
	const [targetType, setTargetType] = useState<Exclude<AssignmentTargetType, "workspace">>("key");
	const [query, setQuery] = useState("");
	const workspaceMap = useMemo(() => workspaceAssignmentMap(data.workspaceGuardrailIds ?? []), [data.workspaceGuardrailIds]);
	const rows = useMemo(() => buildWizardAssignRows({
		targetType,
		keys: data.keys,
		members: data.members,
		departments: data.departments,
		guardrails: data.guardrails,
		guardrailWorkspaceIdsByGuardrailId: workspaceMap,
		guardrailDepartmentIdsByGuardrailId: data.guardrailDepartmentIdsByGuardrailId,
		guardrailKeyIdsByGuardrailId: data.guardrailKeyIdsByGuardrailId,
		guardrailMemberIdsByGuardrailId: data.guardrailMemberIdsByGuardrailId,
		keyDepartmentIds: data.keyDepartmentIds,
		memberDepartmentIds: data.memberDepartmentIds,
		draft: props.draft,
		...selection,
		untitled: t("guardrailsControls.untitled"),
		departmentDetail: (counts) => t("guardrailAssignments.departmentReach", counts),
	}), [targetType, data, workspaceMap, props.draft, selection, t]);
	const visibleRows = useMemo(() => rows.filter((row) => matchesAssignmentQuery(row, query)), [rows, query]);
	const field = targetType === "key" ? "keyIds" : targetType === "member" ? "memberIds" : "departmentIds";
	const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => row.selected);
	const someVisibleSelected = visibleRows.some((row) => row.selected);
	const departments = data.departments ?? [];
	const counts = { department: departments.length, member: data.members.length, key: data.keys.length };
	const chosen = { department: selection.departmentIds.length, member: selection.memberIds.length, key: selection.keyIds.length };

	function setSelected(ids: Iterable<string>, checked: boolean) {
		const next = new Set(selection[field]);
		for (const id of ids) {
			if (checked) next.add(id);
			else next.delete(id);
		}
		props.onChange({ ...selection, [field]: [...next] });
	}

	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-4 rounded-md border p-4">
				<div>
					<p className="text-sm font-medium">{t("guardrailWizard.wholeWorkspaceTitle")}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{selection.workspaceAssigned ? t("guardrailWizard.wholeWorkspaceOn") : t("guardrailWizard.wholeWorkspaceBody")}
					</p>
				</div>
				<Switch
					checked={selection.workspaceAssigned}
					onCheckedChange={(workspaceAssigned) => props.onChange({ ...selection, workspaceAssigned })}
					aria-label={t("guardrailWizard.wholeWorkspaceTitle")}
				/>
			</div>

			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-3">
					<Tabs value={targetType} onValueChange={(value) => { setTargetType(value as typeof targetType); setQuery(""); }}>
						<TabsList>
							{(["department", "member", "key"] as const).map((type) => (
								<TabsTrigger key={type} value={type}>
									{t(`guardrailAssignments.${type === "department" ? "departmentsView" : type === "member" ? "membersView" : "keysView"}`)}
									<span className="text-muted-foreground">{chosen[type] ? `${chosen[type]}/${counts[type]}` : counts[type]}</span>
								</TabsTrigger>
							))}
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
					<Table wrapInContainer={false} className="min-w-[760px] table-fixed [&_tr:last-child]:border-b-0 [&_th]:px-3 [&_td]:px-3 [&_td]:py-3 [&_td]:align-top">
						<TableHeader className="bg-muted/30">
							<TableRow>
								<TableHead className="w-10">
									<Checkbox
										checked={allVisibleSelected}
										indeterminate={someVisibleSelected && !allVisibleSelected}
										disabled={!visibleRows.length || selection.workspaceAssigned}
										onCheckedChange={(checked) => setSelected(visibleRows.map((row) => row.id), checked === true)}
										aria-label={t("guardrailAssignments.selectAll")}
									/>
								</TableHead>
								<TableHead className="w-[24%]">
									{t(targetType === "key" ? "guardrailAssignments.columnKey" : targetType === "member" ? "guardrailAssignments.columnMember" : "guardrailAssignments.columnDepartment")}
								</TableHead>
								<TableHead className="w-[34%]">{t("guardrailWizard.columnNow")}</TableHead>
								<TableHead>{t("guardrailWizard.columnAfter")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleRows.length ? visibleRows.map((row) => (
								<TableRow key={row.id} data-state={row.selected ? "selected" : undefined}>
									<TableCell>
										<Checkbox
											checked={row.selected || selection.workspaceAssigned}
											disabled={selection.workspaceAssigned}
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
											<div className={row.type === "key" ? "truncate font-mono text-xs text-muted-foreground" : row.type === "member" ? "truncate text-xs capitalize text-muted-foreground" : "truncate text-xs text-muted-foreground"}>
												{row.detail}
											</div>
										</div>
									</TableCell>
									<TableCell>
										<NowCell row={row} />
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
											: t(targetType === "key" ? "guardrailAssignments.noKeys" : targetType === "member" ? "guardrailAssignments.noMembers" : "guardrailAssignments.noDepartments")}
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>

				<p className="text-xs text-muted-foreground">{t("guardrailWizard.assignMemberHint")}</p>
			</div>
		</div>
	);
}

function NowCell({ row }: { row: WizardAssignRow }) {
	const sourceLabel = useSourceLabel();
	return (
		<div className="min-w-0 space-y-1">
			{row.guardrails.length ? (
				<div className="flex min-w-0 flex-wrap gap-1">
					{row.guardrails.map((guardrail) => {
						const label = sourceLabel(guardrail.source);
						return (
							<Badge key={guardrail.id} variant={guardrail.source.level === "direct" ? "outline" : "secondary"} className={guardrail.enabled ? "max-w-full" : "max-w-full opacity-60"}>
								<span className="truncate">{guardrail.name}</span>
								{label ? <span className="font-normal text-muted-foreground">{label}</span> : null}
							</Badge>
						);
					})}
				</div>
			) : null}
			<PolicyLine policy={row.effective} />
		</div>
	);
}

function AfterCell({ row }: { row: WizardAssignRow }) {
	const t = useTranslations("SettingsUI");
	if (!row.after) return <span className="text-sm text-muted-foreground">{t("guardrailWizard.notApplied")}</span>;
	const covered = row.coveredVia && !row.selected
		? row.coveredVia.level === "workspace"
			? t("guardrailWizard.coveredByWorkspace")
			: row.coveredVia.level === "department"
				? t("guardrailWizard.coveredByDepartment", { name: row.coveredVia.name })
				: t("guardrailWizard.coveredVia", { name: row.coveredVia.name })
		: null;
	return (
		<div className="min-w-0 space-y-1">
			<div className="flex items-start gap-1.5">
				<ArrowRight className={row.changes ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" : "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"} aria-hidden="true" />
				<PolicyLine policy={row.after} emphasis={row.changes} />
			</div>
			{covered ? <p className="text-xs text-muted-foreground">{covered}</p> : null}
			{!row.changes ? <p className="text-xs text-muted-foreground">{t("guardrailWizard.noTighter")}</p> : null}
		</div>
	);
}

/** Access, prompt injection, sensitive info and rate limits on one line, e.g. "ZDR only · Prompt injection: Block · 4 sensitive info rules". */
function PolicyLine({ policy, emphasis = false }: { policy: EffectiveGuardrailPolicy; emphasis?: boolean }) {
	const t = useTranslations("SettingsUI");
	const parts = accessSummaryParts(policy, t);
	if (policy.promptInjection) parts.push(t("guardrailWizard.promptInjectionPart", { action: t(`guardrailsControls.${policy.promptInjection}`) }));
	if (policy.sensitiveInfoRuleCount) parts.push(t("guardrailWizard.sensitiveInfoPart", { count: policy.sensitiveInfoRuleCount }));
	parts.push(...rateSummaryParts(policy, t));
	parts.push(...spendSummaryParts(policy, t));
	if (!parts.length) return <span className="text-sm text-muted-foreground">{t("guardrailAssignments.noLimits")}</span>;
	return <span className={emphasis ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{parts.join(" · ")}</span>;
}
