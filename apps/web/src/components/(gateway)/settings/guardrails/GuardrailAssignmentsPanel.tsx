"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Search, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import { updateGuardrailAssignments } from "@/app/(dashboard)/settings/guardrails/actions";
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
	SettingsGuardrailKey,
	SettingsGuardrailMember,
	SettingsGuardrailRow,
} from "@/lib/fetchers/internal/settingsTypes";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import {
	applyGuardrailAssignmentChange,
	buildGuardrailAssignmentRows,
	directAssignmentState,
	matchesAssignmentQuery,
	type EffectiveGuardrailPolicy,
	type GuardrailAssignmentRow,
} from "./guardrailAssignments";

/** Matches MAX_ASSIGNMENT_TARGETS in web-api's guardrail routes. */
const MAX_TARGETS_PER_CHANGE = 200;

type Change = { targetIds: string[]; addGuardrailIds?: string[]; removeGuardrailIds?: string[] };
type Draft = { base: Record<string, string[]>; map: Record<string, string[]> };

type Props = {
	workspaceId: string;
	canManageGuardrails: boolean;
	guardrails: SettingsGuardrailRow[];
	keys: SettingsGuardrailKey[];
	members: SettingsGuardrailMember[];
	guardrailKeyIdsByGuardrailId: Record<string, string[]>;
	guardrailMemberIdsByGuardrailId: Record<string, string[]>;
};

export default function GuardrailAssignmentsPanel(props: Props) {
	const t = useTranslations("SettingsUI");
	const write = useSettingsWrite();
	const [view, setView] = useQueryState("view", parseAsStringLiteral(["keys", "members"] as const).withDefault("keys"));
	const targetType = view === "members" ? "member" : "key";
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [pending, setPending] = useState<Set<string>>(() => new Set());
	// A draft shows a change straight away and is dropped once fresh settings data arrives.
	const [keyDraft, setKeyDraft] = useState<Draft | null>(null);
	const [memberDraft, setMemberDraft] = useState<Draft | null>(null);
	const keyMap = keyDraft?.base === props.guardrailKeyIdsByGuardrailId ? keyDraft.map : props.guardrailKeyIdsByGuardrailId;
	const memberMap = memberDraft?.base === props.guardrailMemberIdsByGuardrailId ? memberDraft.map : props.guardrailMemberIdsByGuardrailId;

	const rows = useMemo(() => buildGuardrailAssignmentRows({
		targetType,
		keys: props.keys,
		members: props.members,
		guardrails: props.guardrails,
		guardrailKeyIdsByGuardrailId: keyMap,
		guardrailMemberIdsByGuardrailId: memberMap,
		untitled: t("guardrailsControls.untitled"),
	}), [targetType, props.keys, props.members, props.guardrails, keyMap, memberMap, t]);
	const visibleRows = useMemo(() => rows.filter((row) => matchesAssignmentQuery(row, query)), [rows, query]);
	const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
	const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id));
	const someVisibleSelected = visibleRows.some((row) => selected.has(row.id));

	async function apply(change: Change) {
		if (change.targetIds.length > MAX_TARGETS_PER_CHANGE) {
			toast.error(t("guardrailAssignments.tooMany", { count: MAX_TARGETS_PER_CHANGE }));
			return;
		}
		const base = targetType === "key" ? props.guardrailKeyIdsByGuardrailId : props.guardrailMemberIdsByGuardrailId;
		const setDraft = targetType === "key" ? setKeyDraft : setMemberDraft;
		setDraft((draft) => ({ base, map: applyGuardrailAssignmentChange(draft?.base === base ? draft.map : base, change) }));
		setPending((current) => new Set([...current, ...change.targetIds]));
		try {
			await write(updateGuardrailAssignments({ targetType, ...change }, props.workspaceId));
			toast.success(t("guardrailAssignments.saved"));
		} catch {
			setDraft(null);
			toast.error(t("guardrailAssignments.saveFailed"));
		} finally {
			setPending((current) => new Set([...current].filter((id) => !change.targetIds.includes(id))));
		}
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
		: t(targetType === "key" ? "guardrailAssignments.noKeys" : "guardrailAssignments.noMembers");

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<Tabs value={view} onValueChange={(value) => { setSelected(new Set()); void setView(value === "members" ? "members" : null); }}>
					<TabsList>
						<TabsTrigger value="keys">
							{t("guardrailAssignments.keysView")}
							<span className="text-muted-foreground">{props.keys.length}</span>
						</TabsTrigger>
						<TabsTrigger value="members">
							{t("guardrailAssignments.membersView")}
							<span className="text-muted-foreground">{props.members.length}</span>
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
				{/* In the toolbar row rather than above the table, so the first selection doesn't move the rows being clicked. */}
				{props.canManageGuardrails && selectedRows.length ? (
					<BulkActions
						rows={selectedRows}
						guardrails={props.guardrails}
						busy={selectedRows.some((row) => pending.has(row.id))}
						onApply={apply}
						onClear={() => setSelected(new Set())}
					/>
				) : null}
			</div>

			<div className="overflow-x-auto rounded-md border bg-background">
				<Table wrapInContainer={false} className="min-w-[880px] table-fixed [&_tr:last-child]:border-b-0 [&_th]:px-3 [&_td]:px-3 [&_td]:align-middle">
					<TableHeader className="bg-muted/30">
						<TableRow>
							{props.canManageGuardrails ? (
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
							<TableHead className="w-[22%]">
								{t(targetType === "key" ? "guardrailAssignments.columnKey" : "guardrailAssignments.columnMember")}
							</TableHead>
							<TableHead className="w-[30%]">{t("guardrailAssignments.columnGuardrails")}</TableHead>
							<TableHead className="w-[20%]">{t("guardrailAssignments.columnAccess")}</TableHead>
							<TableHead className="w-[14%]">{t("guardrailAssignments.columnPromptInjection")}</TableHead>
							<TableHead className="w-[14%]">{t("guardrailAssignments.columnSensitiveInfo")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleRows.length ? visibleRows.map((row) => (
							<TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
								{props.canManageGuardrails ? (
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
										<div className={row.type === "key" ? "truncate font-mono text-xs text-muted-foreground" : "truncate text-xs capitalize text-muted-foreground"}>
											{row.detail}
										</div>
									</div>
								</TableCell>
								<TableCell>
									<GuardrailsCell
										row={row}
										guardrails={props.guardrails}
										canManage={props.canManageGuardrails}
										pending={pending.has(row.id)}
										onToggle={(guardrailId, checked) => void apply(checked
											? { targetIds: [row.id], addGuardrailIds: [guardrailId] }
											: { targetIds: [row.id], removeGuardrailIds: [guardrailId] })}
									/>
								</TableCell>
								<TableCell className="text-sm">
									<AccessSummary effective={row.effective} />
								</TableCell>
								<TableCell className="text-sm">
									{row.effective.promptInjection
										? t(`guardrailsControls.${row.effective.promptInjection}`)
										: <span className="text-muted-foreground">{t("guardrailAssignments.off")}</span>}
								</TableCell>
								<TableCell className="text-sm">
									{row.effective.sensitiveInfoRuleCount
										? t("guardrailAssignments.sensitiveRules", { count: row.effective.sensitiveInfoRuleCount })
										: <span className="text-muted-foreground">{t("guardrailAssignments.off")}</span>}
								</TableCell>
							</TableRow>
						)) : (
							<TableRow>
								<TableCell colSpan={props.canManageGuardrails ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">
									{emptyMessage}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<p className="text-xs text-muted-foreground">
				{t("guardrailAssignments.footnote")}
				{props.canManageGuardrails ? null : ` ${t("guardrailAssignments.readOnly")}`}
			</p>
		</div>
	);
}

function GuardrailsCell(props: {
	row: GuardrailAssignmentRow;
	guardrails: SettingsGuardrailRow[];
	canManage: boolean;
	pending: boolean;
	onToggle: (guardrailId: string, checked: boolean) => void;
}) {
	const t = useTranslations("SettingsUI");
	const chips = props.row.guardrails.length ? (
		<span className="flex min-w-0 flex-wrap items-center gap-1">
			{props.row.guardrails.map((guardrail) => (
				<Badge
					key={guardrail.id}
					variant={guardrail.source === "member" ? "secondary" : "outline"}
					className={guardrail.enabled ? "max-w-full" : "max-w-full opacity-60"}
					title={[
						guardrail.source === "member" && props.row.inheritedFrom ? t("guardrailAssignments.inheritedHint", { name: props.row.inheritedFrom.name }) : null,
						guardrail.enabled ? null : t("guardrailAssignments.offHint"),
					].filter(Boolean).join(" ") || undefined}
				>
					<span className="truncate">{guardrail.name}</span>
					{guardrail.source === "member" && props.row.inheritedFrom ? (
						<span className="font-normal text-muted-foreground">{t("guardrailAssignments.viaMember", { name: props.row.inheritedFrom.name })}</span>
					) : null}
					{guardrail.enabled ? null : <span className="font-normal text-muted-foreground">{t("guardrailAssignments.off")}</span>}
				</Badge>
			))}
		</span>
	) : <span className="text-sm text-muted-foreground">{t("guardrailAssignments.none")}</span>;

	if (!props.canManage) return chips;

	const inherited = new Set(props.row.guardrails.filter((guardrail) => guardrail.source === "member").map((guardrail) => guardrail.id));
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={t("guardrailAssignments.editGuardrails", { name: props.row.name })}
				>
					{chips}
					{props.pending ? <Spinner className="h-3.5 w-3.5 shrink-0" /> : <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				{props.guardrails.map((guardrail) => {
					const direct = props.row.directGuardrailIds.includes(guardrail.id);
					const onlyInherited = !direct && inherited.has(guardrail.id);
					return (
						<DropdownMenuCheckboxItem
							key={guardrail.id}
							checked={direct || onlyInherited}
							disabled={props.pending || onlyInherited}
							onCheckedChange={(checked) => props.onToggle(guardrail.id, checked === true)}
						>
							<span className="min-w-0 flex-1 truncate">{guardrail.name?.trim() || t("guardrailsControls.untitled")}</span>
							{onlyInherited && props.row.inheritedFrom ? (
								<span className="shrink-0 text-xs text-muted-foreground">{t("guardrailAssignments.viaMember", { name: props.row.inheritedFrom.name })}</span>
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

function AccessSummary({ effective }: { effective: EffectiveGuardrailPolicy }) {
	const t = useTranslations("SettingsUI");
	const parts: string[] = [];
	if (effective.zdrOnly) parts.push(t("guardrailAssignments.zdrOnly"));
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
	if (!parts.length) return <span className="text-muted-foreground">{t("guardrailAssignments.noLimits")}</span>;
	return <span className="line-clamp-2">{parts.join(" · ")}</span>;
}

function BulkActions(props: {
	rows: GuardrailAssignmentRow[];
	guardrails: SettingsGuardrailRow[];
	busy: boolean;
	onApply: (change: Change) => Promise<void>;
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
