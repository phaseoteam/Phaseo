import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
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

interface DeprecationWarningsProps {
	warnings?: DeprecationWarning[];
	id?: string;
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

	const badge =
		mode === "deprecated" ? (
			<Badge
				variant="outline"
				className="h-5 shrink-0 border-amber-300 bg-amber-50 px-1.5 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
			>
				<span className="font-medium">{deprecatedBadgeLabel}</span>
			</Badge>
		) : (
			<Badge
				variant="outline"
				className="h-5 shrink-0 gap-1 border-red-300 bg-red-50 px-1.5 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
			>
				<span className="font-semibold">Retired</span>
			</Badge>
		);

	return (
		<div className="rounded-xl border bg-card p-3 shadow-sm">
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
				<div className="min-w-0 flex-1">
					<ModelLink
						modelId={row.modelId}
						modelName={row.modelName}
						organisationId={row.organisationId}
						className="truncate text-sm font-medium"
					/>
					{hasReadableName ? (
						<div className="mt-0.5 truncate text-[11px] font-mono text-muted-foreground">
							{row.modelId}
						</div>
					) : null}
				</div>
				{badge}
			</div>

			{mode === "deprecated" ? (
				<p className="mt-2 text-[11px] text-muted-foreground">
					This model has been deprecated and is due to retire on{" "}
					<span className="font-medium text-foreground">
						{row.retirementDate ? formatDate(row.retirementDate) : "TBD"}
					</span>
					. It will no longer be usable after this date.
				</p>
			) : (
				<p className="mt-2 text-[11px] text-muted-foreground">
					This model retired on{" "}
					<span className="font-medium text-foreground">
						{row.retirementDate ? formatDate(row.retirementDate) : "unknown date"}
					</span>
					. It is no longer usable.
				</p>
			)}

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
}: DeprecationWarningsProps = {}) {
	const teamId = await getTeamIdFromCookie();
	if (!teamId) return null;

	const rawWarnings = warnings ?? (await getDeprecationWarningsForTeam(teamId));
	if (!rawWarnings.length) return null;

	const deprecatedRows = sortByRetirementDateAsc(
		rawWarnings.filter(
			(row) =>
				row.deprecationDaysUntil !== null &&
				(row.retirementDaysUntil === null || row.retirementDaysUntil >= 0),
		),
	);

	const recentRetiredRows = sortRecentRetired(
		rawWarnings.filter((row) => (row.retirementDaysUntil ?? 0) < 0),
	);
	if (!deprecatedRows.length && !recentRetiredRows.length) return null;

	return (
		<div id={id} className="space-y-3">
			<div className="flex items-center gap-2">
				<h3 className="text-base font-semibold">Model Lifecycle Alerts</h3>
				<Separator className="flex-1" />
				<Badge
					variant="outline"
					className="h-5 border-amber-300 bg-amber-50 px-1.5 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
				>
					<AlertTriangle className="mr-1 h-3 w-3" />
					Action required
				</Badge>
			</div>

			<div className="space-y-5">
				<SectionBlock
					title="Deprecated Models"
					rows={deprecatedRows}
					mode="deprecated"
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
