import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search, Shield } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import { updateGuardrailAssignments } from "@/features/settings/guardrails/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
	SettingsGuardrailDepartment,
	SettingsGuardrailKey,
	SettingsGuardrailMember,
	SettingsGuardrailRow,
} from "@/lib/fetchers/internal/settingsTypes";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { MAX_ASSIGNMENT_TARGETS } from "./guardrailAssignmentLimits";
import {
	buildGuardrailAssignmentRows,
	chunkAssignmentChange,
	directAssignmentState,
	matchesAssignmentQuery,
	withPendingChanges,
	workspaceAssignmentMap,
	type AssignedGuardrail,
	type AssignmentChange,
	type AssignmentTargetType,
	type EffectiveGuardrailPolicy,
	type GuardrailAssignmentRow,
	type GuardrailSource,
	type PendingAssignmentChange,
} from "./guardrailAssignments";
import { formatUsd } from "./guardrailWizard";

type Props = {
	workspaceId: string;
	canManageGuardrails: boolean;
	guardrails: SettingsGuardrailRow[];
	keys: SettingsGuardrailKey[];
	members: SettingsGuardrailMember[];
	departments?: SettingsGuardrailDepartment[];
	workspaceGuardrailIds?: string[];
	guardrailDepartmentIdsByGuardrailId?: Record<string, string[]>;
	guardrailKeyIdsByGuardrailId: Record<string, string[]>;
	guardrailMemberIdsByGuardrailId: Record<string, string[]>;
	keyDepartmentIds?: Record<string, string[]>;
	memberDepartmentIds?: Record<string, string[]>;
	/** Saves one change; the server action unless a preview supplies its own. */
	save?: typeof updateGuardrailAssignments;
};

const VIEWS = ["workspace", "departments", "members", "keys"] as const;
type View = (typeof VIEWS)[number];
const TARGET_TYPE: Record<View, AssignmentTargetType> = { workspace: "workspace", departments: "department", members: "member", keys: "key" };
const EMPTY: Record<string, string[]> = {};

export default function GuardrailAssignmentsPanel(props: Props) {
	const t = useTranslations("SettingsUI");
	const write = useSettingsWrite();
	// The workspace baseline is always on the whole workspace: it shows where it applies, but is never assigned here.
	const assignable = useMemo(() => props.guardrails.filter((guardrail) => !guardrail.is_workspace_baseline), [props.guardrails]);
	const [view, setView] = useQueryState("view", parseAsStringLiteral(VIEWS).withDefault("keys"));
	const targetType = TARGET_TYPE[view];
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	// Each change shows straight away and is tracked on its own, so one finishing or failing never
	// undoes another that is still saving.
	const [changes, setChanges] = useState<PendingAssignmentChange[]>([]);
	const nextChangeId = useRef(0);
	const workspaceSaved = useMemo(() => workspaceAssignmentMap(props.workspaceGuardrailIds ?? []), [props.workspaceGuardrailIds]);
	const saved: Record<AssignmentTargetType, Record<string, string[]>> = useMemo(() => ({
		workspace: workspaceSaved,
		department: props.guardrailDepartmentIdsByGuardrailId ?? EMPTY,
		member: props.guardrailMemberIdsByGuardrailId,
		key: props.guardrailKeyIdsByGuardrailId,
	}), [workspaceSaved, props.guardrailDepartmentIdsByGuardrailId, props.guardrailMemberIdsByGuardrailId, props.guardrailKeyIdsByGuardrailId]);
	const latest = useRef(saved);
	// Updated before the effect below runs in the same commit, and read again after a save resolves.
	useLayoutEffect(() => {
		latest.current = saved;
	}, [saved]);
	const maps = useMemo(() => ({
		workspace: withPendingChanges(saved.workspace, "workspace", changes),
		department: withPendingChanges(saved.department, "department", changes),
		member: withPendingChanges(saved.member, "member", changes),
		key: withPendingChanges(saved.key, "key", changes),
	}), [saved, changes]);
	// A saved change is dropped once fresher data, which includes it, has arrived.
	useEffect(() => {
		setChanges((current) => {
			const next = current.filter((entry) => entry.savedOn === null || entry.savedOn === latest.current[entry.targetType]);
			return next.length === current.length ? current : next;
		});
	}, [saved, changes]);
	const pendingTargets = useMemo(() => {
		const ids = new Set<string>();
		for (const entry of changes) if (entry.savedOn === null) for (const id of entry.change.targetIds) ids.add(`${entry.targetType}:${id}`);
		return ids;
	}, [changes]);

	const rows = useMemo(() => buildGuardrailAssignmentRows({
		targetType,
		keys: props.keys,
		members: props.members,
		departments: props.departments,
		guardrails: props.guardrails,
		guardrailWorkspaceIdsByGuardrailId: maps.workspace,
		guardrailDepartmentIdsByGuardrailId: maps.department,
		guardrailKeyIdsByGuardrailId: maps.key,
		guardrailMemberIdsByGuardrailId: maps.member,
		keyDepartmentIds: props.keyDepartmentIds,
		memberDepartmentIds: props.memberDepartmentIds,
		untitled: t("guardrailsControls.untitled"),
		workspace: { name: t("guardrailAssignments.wholeWorkspace"), detail: t("guardrailAssignments.wholeWorkspaceDetail") },
		departmentDetail: (counts) => t("guardrailAssignments.departmentReach", counts),
	}), [targetType, props.keys, props.members, props.departments, props.guardrails, maps, props.keyDepartmentIds, props.memberDepartmentIds, t]);
	const visibleRows = useMemo(() => rows.filter((row) => matchesAssignmentQuery(row, query)), [rows, query]);
	// Bulk actions reach only the selected rows the search shows, never ones it hides.
	const selectedRows = useMemo(() => visibleRows.filter((row) => selected.has(row.id)), [visibleRows, selected]);
	const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id));
	const someVisibleSelected = visibleRows.some((row) => selected.has(row.id));
	// One row, so the workspace view has nothing to select or search.
	const selectable = props.canManageGuardrails && targetType !== "workspace";

	async function apply(change: AssignmentChange, type: AssignmentTargetType = targetType) {
		const id = nextChangeId.current++;
		setChanges((current) => [...current, { id, targetType: type, change, savedOn: null }]);
		// The API takes up to MAX_ASSIGNMENT_TARGETS targets per change, so a larger selection goes in parts.
		const parts = chunkAssignmentChange(change, MAX_ASSIGNMENT_TARGETS);
		let done = 0;
		let reason: string | null = null;
		let failed = false;
		// The data the last part was saved against. Taken before the save, so data that arrives
		// later always includes the change; at worst the change is dropped a refetch early.
		let savedOn = latest.current[type];
		try {
			for (const part of parts) {
				savedOn = latest.current[type];
				// The workspace is the target itself, so its change names no target ids.
				const request = type === "workspace" ? { ...part, targetIds: [] } : part;
				const result = await write((props.save ?? updateGuardrailAssignments)({ data: { change: { targetType: type, ...request }, expectedWorkspaceId: props.workspaceId } }));
				if (!result.ok) {
					failed = true;
					reason = result.error;
					break;
				}
				done += part.targetIds.length;
			}
		} catch {
			failed = true;
		}
		if (failed) {
			// Drop only this change; the refetch shows what was saved.
			setChanges((current) => current.filter((entry) => entry.id !== id));
			const description = reason ?? undefined;
			if (done) toast.error(t("guardrailAssignments.savedPartly", { done, count: change.targetIds.length }), { description });
			else toast.error(t("guardrailAssignments.saveFailed"), { description });
			return;
		}
		setChanges((current) => current.map((entry) => entry.id === id ? { ...entry, savedOn } : entry));
		toast.success(t("guardrailAssignments.saved"));
	}

	if (!props.guardrails.length) {
		return (
			<Empty className="rounded-md border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Shield className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>{t("guardrailAssignments.emptyTitle")}</EmptyTitle>
					<EmptyDescription>{t("guardrailAssignments.emptyBody")}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const emptyMessage = rows.length
		? t("guardrailAssignments.noMatches")
		: t(targetType === "key" ? "guardrailAssignments.noKeys" : targetType === "member" ? "guardrailAssignments.noMembers" : "guardrailAssignments.noDepartments");
	const counts: Record<View, number | null> = { workspace: null, departments: props.departments?.length ?? 0, members: props.members.length, keys: props.keys.length };
	const nameColumn = { workspace: "columnWorkspace", department: "columnDepartment", member: "columnMember", key: "columnKey" } as const;

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<Tabs value={view} onValueChange={(value) => { setSelected(new Set()); setQuery(""); void setView(value === "keys" ? null : value as View); }}>
					<TabsList>
						{VIEWS.map((item) => (
							<TabsTrigger key={item} value={item}>
								{t(`guardrailAssignments.${item}View`)}
								{counts[item] === null ? null : <span className="text-muted-foreground">{counts[item]}</span>}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{targetType === "workspace" ? null : (
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
				)}
				{/* In the toolbar row rather than above the table, so the first selection doesn't move the rows being clicked. */}
				{selectable && selectedRows.length ? (
					<BulkActions
						rows={selectedRows}
						guardrails={assignable}
						busy={selectedRows.some((row) => pendingTargets.has(`${targetType}:${row.id}`))}
						onApply={apply}
						onClear={() => setSelected(new Set())}
					/>
				) : null}
			</div>

			<div className="overflow-x-auto rounded-md border bg-background">
				<Table wrapInContainer={false} className="min-w-[880px] table-fixed [&_tr:last-child]:border-b-0 [&_th]:px-3 [&_td]:px-3 [&_td]:align-top [&_td]:py-3">
					<TableHeader className="bg-muted/30">
						<TableRow>
							{selectable ? (
								<TableHead className="w-10">
									<Checkbox
										checked={allVisibleSelected}
										indeterminate={someVisibleSelected && !allVisibleSelected}
										disabled={!visibleRows.length}
										onCheckedChange={(checked) => setSelected((current) => {
											const next = new Set(current);
											for (const row of visibleRows) {
												if (checked) next.add(row.id);
												else next.delete(row.id);
											}
											return next;
										})}
										aria-label={t("guardrailAssignments.selectAll")}
									/>
								</TableHead>
							) : null}
							<TableHead className="w-[16%]">{t(`guardrailAssignments.${nameColumn[targetType]}`)}</TableHead>
							<TableHead className="w-[24%]">{t("guardrailAssignments.columnGuardrails")}</TableHead>
							<TableHead className="w-[18%]">{t("guardrailAssignments.columnAccess")}</TableHead>
							<TableHead className="w-[14%]">{t("guardrailAssignments.columnSafety")}</TableHead>
							<TableHead className="w-[14%]">{t("guardrailAssignments.columnRate")}</TableHead>
							<TableHead className="w-[14%]">{t("guardrailAssignments.columnSpend")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleRows.length ? visibleRows.map((row) => (
							<TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
								{selectable ? (
									<TableCell>
										<Checkbox
											checked={selected.has(row.id)}
											onCheckedChange={(checked) => setSelected((current) => {
												const next = new Set(current);
												if (checked) next.add(row.id);
												else next.delete(row.id);
												return next;
											})}
											aria-label={t("guardrailAssignments.selectRow", { name: row.name })}
										/>
									</TableCell>
								) : null}
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
									<GuardrailsCell
										row={row}
										guardrails={assignable}
										canManage={props.canManageGuardrails}
										pending={pendingTargets.has(`${targetType}:${row.id}`) || (row.inheritedFrom ? pendingTargets.has(`member:${row.inheritedFrom.id}`) : false)}
										onToggle={(guardrailId, checked) => void apply(checked
											? { targetIds: [row.id], addGuardrailIds: [guardrailId] }
											: { targetIds: [row.id], removeGuardrailIds: [guardrailId] })}
										onRemoveFormerMemberGuardrail={(memberId, guardrailId) => void apply({ targetIds: [memberId], removeGuardrailIds: [guardrailId] }, "member")}
									/>
								</TableCell>
								<TableCell className="text-sm">
									<AccessSummary effective={row.effective} />
									<FromLine guardrails={row.accessFrom} />
								</TableCell>
								<TableCell className="text-sm">
									<SafetySummary effective={row.effective} />
									<FromLine guardrails={row.safetyFrom} />
								</TableCell>
								<TableCell className="text-sm">
									<RateSummary effective={row.effective} />
									<FromLine guardrails={row.rateFrom} />
								</TableCell>
								<TableCell className="text-sm">
									<SpendSummary effective={row.effective} />
									<FromLine guardrails={row.spendFrom} />
								</TableCell>
							</TableRow>
						)) : (
							<TableRow>
								<TableCell colSpan={selectable ? 7 : 6} className="py-8 text-center text-sm text-muted-foreground">
									{emptyMessage}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<p className="text-xs text-muted-foreground">
				{t("guardrailAssignments.footnoteLevels")}
				{props.canManageGuardrails ? null : ` ${t("guardrailAssignments.readOnly")}`}
			</p>
		</div>
	);
}

/** Where an inherited guardrail comes from, e.g. "Workspace", "Engineering" or "via Sam". */
export function useSourceLabel() {
	const t = useTranslations("SettingsUI");
	return (source: GuardrailSource): string | null => {
		if (source.level === "workspace") return t("guardrailAssignments.fromWorkspace");
		if (source.level === "department") return source.name;
		if (source.level === "member") return t("guardrailAssignments.viaMember", { name: source.name ?? t("guardrailAssignments.formerMember") });
		return null;
	};
}

function sourceHint(t: ReturnType<typeof useTranslations<"SettingsUI">>, source: GuardrailSource): string | null {
	if (source.level === "workspace") return t("guardrailAssignments.workspaceHint");
	if (source.level === "department") return t("guardrailAssignments.departmentHint", { name: source.name });
	if (source.level === "member") return source.name === null ? t("guardrailAssignments.formerMemberHint") : t("guardrailAssignments.inheritedHint", { name: source.name });
	return null;
}

function GuardrailChip({ guardrail }: { guardrail: AssignedGuardrail }) {
	const t = useTranslations("SettingsUI");
	const sourceLabel = useSourceLabel();
	const label = sourceLabel(guardrail.source);
	const hint = [
		guardrail.baseline ? t("guardrailAssignments.baselineHint") : sourceHint(t, guardrail.source),
		guardrail.enabled ? null : t("guardrailAssignments.offHint"),
	].filter(Boolean).join(" ");
	return (
		<Badge
			variant={guardrail.source.level === "direct" ? "outline" : "secondary"}
			className={guardrail.enabled ? "max-w-full" : "max-w-full opacity-60"}
			title={hint || undefined}
		>
			<span className="truncate">{guardrail.name}</span>
			{label ? <span className="font-normal text-muted-foreground">{label}</span> : null}
			{guardrail.enabled ? null : <span className="font-normal text-muted-foreground">{t("guardrailAssignments.off")}</span>}
		</Badge>
	);
}

function GuardrailsCell(props: {
	row: GuardrailAssignmentRow;
	guardrails: SettingsGuardrailRow[];
	canManage: boolean;
	pending: boolean;
	onToggle: (guardrailId: string, checked: boolean) => void;
	/** Former members are not listed in the Members view, so their guardrails are removed from their keys' rows. */
	onRemoveFormerMemberGuardrail: (memberId: string, guardrailId: string) => void;
}) {
	const t = useTranslations("SettingsUI");
	const sourceLabel = useSourceLabel();
	const chips = props.row.guardrails.length ? (
		<span className="flex min-w-0 flex-wrap items-center gap-1">
			{props.row.guardrails.map((guardrail) => <GuardrailChip key={guardrail.id} guardrail={guardrail} />)}
		</span>
	) : <span className="text-sm text-muted-foreground">{t("guardrailAssignments.none")}</span>;

	if (!props.canManage) return chips;

	const inheritedById = new Map(props.row.guardrails.filter((guardrail) => guardrail.source.level !== "direct").map((guardrail) => [guardrail.id, guardrail]));
	const formerMember = props.row.inheritedFrom && props.row.inheritedFrom.name === null ? props.row.inheritedFrom : null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="-mx-1.5 -my-1 flex w-[calc(100%+0.75rem)] min-w-0 items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={t("guardrailAssignments.editGuardrails", { name: props.row.name })}
				>
					{chips}
					{props.pending ? <Spinner className="h-3.5 w-3.5 shrink-0" /> : <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-80">
				{props.guardrails.map((guardrail) => {
					const direct = props.row.directGuardrailIds.includes(guardrail.id);
					const inherited = direct ? undefined : inheritedById.get(guardrail.id);
					// Only a former member's guardrail can be taken off from here: they have no row of their own.
					const removableHere = inherited?.source.level === "member" && formerMember !== null;
					return (
						<DropdownMenuCheckboxItem
							key={guardrail.id}
							checked={direct || Boolean(inherited)}
							disabled={props.pending || (Boolean(inherited) && !removableHere)}
							onCheckedChange={(checked) => inherited && removableHere && formerMember
								? props.onRemoveFormerMemberGuardrail(formerMember.id, guardrail.id)
								: props.onToggle(guardrail.id, checked === true)}
						>
							<span className="min-w-0 flex-1 truncate">{guardrail.name?.trim() || t("guardrailsControls.untitled")}</span>
							{inherited ? (
								<span className="shrink-0 text-xs text-muted-foreground">{sourceLabel(inherited.source)}</span>
							) : guardrail.enabled === true ? null : (
								<span className="shrink-0 text-xs text-muted-foreground">{t("guardrailAssignments.off")}</span>
							)}
						</DropdownMenuCheckboxItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** The guardrails a column's rules come from, e.g. "From Workspace baseline, EU data (Engineering)". */
function FromLine({ guardrails }: { guardrails: AssignedGuardrail[] }) {
	const t = useTranslations("SettingsUI");
	const sourceLabel = useSourceLabel();
	if (!guardrails.length) return null;
	const names = guardrails.map((guardrail) => {
		const label = sourceLabel(guardrail.source);
		return label ? `${guardrail.name} (${label})` : guardrail.name;
	});
	return <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={names.join(", ")}>{t("guardrailAssignments.fromGuardrails", { names: names.join(", ") })}</p>;
}

export function AccessSummary({ effective }: { effective: EffectiveGuardrailPolicy }) {
	const t = useTranslations("SettingsUI");
	const parts = accessSummaryParts(effective, t);
	if (!parts.length) return <span className="text-muted-foreground">{t("guardrailAssignments.noLimits")}</span>;
	return <span className="line-clamp-2">{parts.join(" · ")}</span>;
}

function SafetySummary({ effective }: { effective: EffectiveGuardrailPolicy }) {
	const t = useTranslations("SettingsUI");
	const parts: string[] = [];
	if (effective.promptInjection) parts.push(t("guardrailAssignments.promptInjectionPart", { action: t(`guardrailsControls.${effective.promptInjection}`) }));
	if (effective.sensitiveInfoRuleCount) parts.push(t("guardrailAssignments.sensitiveInfoPart", { count: effective.sensitiveInfoRuleCount }));
	if (!parts.length) return <span className="text-muted-foreground">{t("guardrailAssignments.off")}</span>;
	return <span className="line-clamp-2">{parts.join(" · ")}</span>;
}

function RateSummary({ effective }: { effective: EffectiveGuardrailPolicy }) {
	const t = useTranslations("SettingsUI");
	const parts = rateSummaryParts(effective, t);
	if (!parts.length) return <span className="text-muted-foreground">{t("guardrailAssignments.noLimits")}</span>;
	return <span className="line-clamp-2">{parts.join(" · ")}</span>;
}

/** The lowest rate limits that reach a row, e.g. "60 requests a minute · 5 at a time". */
export function rateSummaryParts(effective: EffectiveGuardrailPolicy, t: ReturnType<typeof useTranslations<"SettingsUI">>): string[] {
	const parts: string[] = [];
	if (effective.requestsPerMinute != null) parts.push(t("guardrailAssignments.rateRequests", { count: effective.requestsPerMinute }));
	if (effective.tokensPerMinute != null) parts.push(t("guardrailAssignments.rateTokens", { count: effective.tokensPerMinute }));
	if (effective.concurrentRequests != null) parts.push(t("guardrailAssignments.rateConcurrent", { count: effective.concurrentRequests }));
	return parts;
}

function SpendSummary({ effective }: { effective: EffectiveGuardrailPolicy }) {
	const t = useTranslations("SettingsUI");
	const parts = spendSummaryParts(effective, t);
	if (!parts.length) return <span className="text-muted-foreground">{t("guardrailAssignments.noLimits")}</span>;
	return <span className="line-clamp-2">{parts.join(" · ")}</span>;
}

/**
 * Whether any spend guardrail blocks, then the lowest limit of each period that reaches a row, e.g.
 * "Blocks · $25.00 a day · $500.00 a month". Blocking comes first so a clamped cell never hides it.
 */
export function spendSummaryParts(effective: EffectiveGuardrailPolicy, t: ReturnType<typeof useTranslations<"SettingsUI">>): string[] {
	const limits: string[] = [];
	for (const period of ["daily", "weekly", "monthly"] as const) {
		const limit = effective.spendLimits[period];
		if (limit != null) limits.push(t(`guardrailAssignments.spend.${period}` as never, { amount: formatUsd(limit) } as never));
	}
	if (!limits.length) return [];
	return [t(effective.spendBlocks ? "guardrailAssignments.spendBlocks" : "guardrailAssignments.spendNotifies"), ...limits];
}

/** The access part of an effective policy as short phrases, e.g. "ZDR only · 3 providers allowed". */
export function accessSummaryParts(effective: EffectiveGuardrailPolicy, t: ReturnType<typeof useTranslations<"SettingsUI">>): string[] {
	const parts: string[] = [];
	if (effective.zdrOnly) parts.push(t("guardrailAssignments.zdrOnly"));
	if (effective.noPaidTraining && effective.noFreeTraining) parts.push(t("guardrailAssignments.noTraining"));
	else if (effective.noPaidTraining) parts.push(t("guardrailAssignments.noPaidTraining"));
	else if (effective.noFreeTraining) parts.push(t("guardrailAssignments.noFreeTraining"));
	if (effective.noLogging) parts.push(t("guardrailAssignments.noLogging"));
	if (effective.providerAllowCount !== null) {
		parts.push(effective.providerAllowCount
			? t("guardrailAssignments.providersAllowed", { count: effective.providerAllowCount })
			: t("guardrailAssignments.noProvidersAllowed"));
	}
	if (effective.providerBlockCount) parts.push(t("guardrailAssignments.providersBlocked", { count: effective.providerBlockCount }));
	if (effective.modelAllowCount !== null) {
		parts.push(effective.modelAllowCount
			? t("guardrailAssignments.modelsAllowed", { count: effective.modelAllowCount })
			: t("guardrailAssignments.noModelsAllowed"));
	}
	if (effective.modelBlockCount) parts.push(t("guardrailAssignments.modelsBlocked", { count: effective.modelBlockCount }));
	return parts;
}

function BulkActions(props: {
	rows: GuardrailAssignmentRow[];
	guardrails: SettingsGuardrailRow[];
	busy: boolean;
	onApply: (change: AssignmentChange) => Promise<void>;
	onClear: () => void;
}) {
	const t = useTranslations("SettingsUI");
	const targetIds = props.rows.map((row) => row.id);
	const states = new Map(props.guardrails.map((guardrail) => [guardrail.id, directAssignmentState(props.rows, guardrail.id)]));
	const removable = props.guardrails.filter((guardrail) => states.get(guardrail.id) !== "none");
	const label = (guardrail: SettingsGuardrailRow) => guardrail.name?.trim() || t("guardrailsControls.untitled");
	return (
		<div className="flex flex-wrap items-center gap-2 sm:ml-auto">
			<span className="text-sm text-muted-foreground">{t("guardrailAssignments.selectedCount", { count: props.rows.length })}</span>
			{props.busy ? <Spinner className="h-3.5 w-3.5" /> : null}
			<div className="flex flex-wrap items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" size="sm" variant="outline" className="rounded-md" disabled={props.busy}>
							{t("guardrailAssignments.addGuardrail")}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						{props.guardrails.map((guardrail) => (
							<DropdownMenuItem
								key={guardrail.id}
								disabled={states.get(guardrail.id) === "all"}
								onClick={() => void props.onApply({ targetIds, addGuardrailIds: [guardrail.id] })}
							>
								<span className="truncate">{label(guardrail)}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" size="sm" variant="outline" className="rounded-md" disabled={props.busy || !removable.length}>
							{t("guardrailAssignments.removeGuardrail")}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						{removable.map((guardrail) => (
							<DropdownMenuItem
								key={guardrail.id}
								onClick={() => void props.onApply({ targetIds, removeGuardrailIds: [guardrail.id] })}
							>
								<span className="truncate">{label(guardrail)}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button type="button" size="sm" variant="ghost" className="rounded-md" onClick={props.onClear}>
					{t("guardrailAssignments.clearSelection")}
				</Button>
			</div>
		</div>
	);
}

