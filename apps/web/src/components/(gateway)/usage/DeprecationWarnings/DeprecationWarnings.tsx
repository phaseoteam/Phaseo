import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import {
	type DeprecationWarning,
	getDeprecationWarningsForTeam,
} from "@/lib/fetchers/usage/deprecationWarnings";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import RetiresBadge from "./RetiresBadge";

interface DeprecationWarningsProps {
	warnings?: DeprecationWarning[];
	id?: string;
	showHeader?: boolean;
}

type AlertCardMode = "deprecated" | "retired";

function formatDate(value: string) {
	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatFutureDays(days: number) {
	if (days <= 0) return "today";
	return `in ${days}d`;
}

function deriveOrganisationId(
	modelId: string,
	organisationId: string | null,
): string | null {
	if (organisationId) return organisationId;
	const [firstSegment] = modelId.split("/");
	return firstSegment || null;
}

function ModelLink({
	modelId,
	modelName,
	organisationId,
	className,
}: {
	modelId: string;
	modelName: string | null;
	organisationId: string | null;
	className?: string;
}) {
	const resolvedOrganisationId = deriveOrganisationId(modelId, organisationId);
	const href = getModelDetailsHref(resolvedOrganisationId, modelId);
	const label = modelName?.trim() || modelId;

	if (!href) return <span className={className}>{label}</span>;

	return (
		<Link href={href} className={cn("hover:underline", className)}>
			{label}
		</Link>
	);
}

function AlertCard({
	row,
	mode,
}: {
	row: DeprecationWarning;
	mode: AlertCardMode;
}) {
	const modelOrgId = deriveOrganisationId(row.modelId, row.organisationId);
	const replacementOrgId = row.replacementModelId
		? deriveOrganisationId(row.replacementModelId, null)
		: null;
	const hasReadableName =
		Boolean(row.modelName?.trim()) && row.modelName?.trim() !== row.modelId;

	const deprecatedBadgeLabel =
		row.retirementDaysUntil !== null
			? `Retires ${formatFutureDays(row.retirementDaysUntil)}`
			: "Deprecated";

	const deprecatedBadgeClassName =
		row.severity === "critical"
			? "h-5 shrink-0 border-red-300 bg-red-50 px-1.5 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
			: row.severity === "warning"
				? "h-5 shrink-0 border-amber-300 bg-amber-50 px-1.5 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
				: row.severity === "notice"
					? "h-5 shrink-0 border-blue-300 bg-blue-50 px-1.5 text-[11px] text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
				: "h-5 shrink-0 border-amber-200 bg-amber-50/60 px-1.5 text-[11px] text-amber-800/70 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200/70";

	const badge =
		mode === "deprecated" ? (
			<RetiresBadge
				label={deprecatedBadgeLabel}
				retirementDate={row.retirementDate}
				className={deprecatedBadgeClassName}
			/>
		) : (
			<Badge
				variant="outline"
				className="h-5 shrink-0 gap-1 border-red-300 bg-red-50 px-1.5 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
			>
				<span className="font-semibold">Retired</span>
			</Badge>
		);

	return (
		<div
			className={cn(
				"rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
			)}
		>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2">
					{modelOrgId ? (
						<Logo
							id={modelOrgId}
							width={16}
							height={16}
							className="mt-1 shrink-0 rounded-sm"
						/>
					) : (
						<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
					)}
					<div className="min-w-0">
						<ModelLink
							modelId={row.modelId}
							modelName={row.modelName}
							organisationId={row.organisationId}
							className="block truncate text-sm font-semibold tracking-tight"
						/>
						{hasReadableName ? (
							<div className="mt-0.5 truncate text-[11px] font-mono text-muted-foreground">
								{row.modelId}
							</div>
						) : null}
					</div>
				</div>
				{badge}
			</div>

			<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
				{mode === "deprecated" ? (
					<>
						{row.lastUsedAt ? (
							<span className="inline-flex items-center gap-1">
								<span>
									Last used{" "}
									<span className="font-medium text-foreground">
										{formatDate(row.lastUsedAt)}
									</span>
								</span>
							</span>
						) : null}
					</>
				) : (
					<span>
						Retired{" "}
						<span className="font-medium text-foreground">
							{row.retirementDate ? formatDate(row.retirementDate) : "unknown"}
						</span>
					</span>
				)}
			</div>

			{mode === "retired" ? (
				<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
					This model is retired and no longer usable.
				</p>
			) : null}

			{row.replacementModelId ? (
				<div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
					<ArrowRight className="h-3 w-3 shrink-0" />
					<span className="shrink-0">Recommended replacement:</span>
					<ModelLink
						modelId={row.replacementModelId}
						modelName={null}
						organisationId={replacementOrgId}
						className="truncate font-medium text-foreground"
					/>
				</div>
			) : mode === "deprecated" ? (
				<div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
					<ArrowRight className="h-3 w-3 shrink-0 opacity-60" />
					<span>No recommended replacement yet.</span>
				</div>
			) : null}
		</div>
	);
}

function CardsBlock({
	rows,
	mode,
	title,
	collapsible = true,
}: {
	rows: DeprecationWarning[];
	mode: AlertCardMode;
	title: string;
	collapsible?: boolean;
}) {
	if (!rows.length) return null;

	const visibleRows = collapsible ? rows.slice(0, 4) : rows;
	const hiddenRows = collapsible ? rows.slice(4) : [];

	return (
		<div className="space-y-2">
			<h4 className="px-1 text-sm font-medium text-foreground">{title}</h4>
			<div className="grid gap-2 md:grid-cols-2">
				{visibleRows.map((row) => (
					<AlertCard key={`${mode}-${row.modelId}`} row={row} mode={mode} />
				))}
			</div>

			{collapsible && hiddenRows.length > 0 ? (
				<details className="rounded-md border">
					<summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
						Show {hiddenRows.length} more
					</summary>
					<div className="grid gap-2 border-t p-2 md:grid-cols-2">
						{hiddenRows.map((row) => (
							<AlertCard
								key={`${mode}-${row.modelId}-more`}
								row={row}
								mode={mode}
							/>
						))}
					</div>
				</details>
			) : null}
		</div>
	);
}

function SectionBlock({
	title,
	rows,
	mode,
}: {
	title: string;
	rows: DeprecationWarning[];
	mode: AlertCardMode;
}) {
	if (!rows.length) return null;

	const visibleRows = rows.slice(0, 4);
	const hiddenRows = rows.slice(4);

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2 px-1">
				<h4 className="text-sm font-medium">{title}</h4>
				<Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
					{rows.length}
				</Badge>
			</div>

			<div className="grid gap-2 md:grid-cols-2">
				{visibleRows.map((row) => (
					<AlertCard key={`${mode}-${row.modelId}`} row={row} mode={mode} />
				))}
			</div>

			{hiddenRows.length > 0 ? (
				<details className="rounded-md border">
					<summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
						Show {hiddenRows.length} more
					</summary>
					<div className="grid gap-2 border-t p-2 md:grid-cols-2">
						{hiddenRows.map((row) => (
							<AlertCard
								key={`${mode}-${row.modelId}-more`}
								row={row}
								mode={mode}
							/>
						))}
					</div>
				</details>
			) : null}
		</div>
	);
}

function sortByRetirementDateAsc(rows: DeprecationWarning[]) {
	return rows.slice().sort((a, b) => {
		const aValue = a.retirementDate ? new Date(a.retirementDate).getTime() : Number.POSITIVE_INFINITY;
		const bValue = b.retirementDate ? new Date(b.retirementDate).getTime() : Number.POSITIVE_INFINITY;
		return aValue - bValue;
	});
}

function sortRecentRetired(rows: DeprecationWarning[]) {
	return rows.slice().sort((a, b) => {
		const aDays = a.retirementDaysUntil ?? -9999;
		const bDays = b.retirementDaysUntil ?? -9999;
		return bDays - aDays;
	});
}

export default async function DeprecationWarnings({
	warnings,
	id = "lifecycle-alerts",
	showHeader = true,
}: DeprecationWarningsProps = {}) {
	const teamId = await getTeamIdFromCookie();
	if (!teamId) return null;

	const rawWarnings = warnings ?? (await getDeprecationWarningsForTeam(teamId));
	if (!rawWarnings.length) return null;

	const deprecatedRows = sortByRetirementDateAsc(
		rawWarnings.filter(
			(row) =>
				(row.retirementDaysUntil ?? row.deprecationDaysUntil) !== null &&
				(row.retirementDaysUntil ?? row.deprecationDaysUntil)! >= 0,
		),
	);

	const deprecatedInUseRows = deprecatedRows.filter((row) => row.countAsAlert);
	const deprecatedFyiRows = deprecatedRows.filter((row) => !row.countAsAlert);

	const recentRetiredRows = sortRecentRetired(
		rawWarnings.filter((row) => (row.retirementDaysUntil ?? 0) < 0),
	);
	if (!deprecatedRows.length && !recentRetiredRows.length) return null;

	return (
		<div id={id} className="space-y-3">
			{showHeader ? (
				<div className="flex items-center gap-2">
					<h3 className="text-base font-semibold">Model Lifecycle Alerts</h3>
					<Separator className="flex-1" />
				</div>
			) : null}

			<div className="space-y-5">
				<CardsBlock
					title="Models You Use"
					rows={deprecatedInUseRows}
					mode="deprecated"
				/>
				{deprecatedInUseRows.length > 0 && deprecatedFyiRows.length > 0 ? (
					<Separator className="my-2" />
				) : null}
				<CardsBlock
					title="Models You Don't Use"
					rows={deprecatedFyiRows}
					mode="deprecated"
					collapsible={false}
				/>
				<SectionBlock
					title="Recent Retirements"
					rows={recentRetiredRows}
					mode="retired"
				/>
			</div>
		</div>
	);
}
