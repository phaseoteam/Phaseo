import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import {
	type DeprecationWarning,
	getDeprecationWarningsForTeam,
} from "@/lib/fetchers/usage/deprecationWarnings";
import { getModelDetailsHref } from "@/lib/models/modelHref";

type ModelLifecycle = DeprecationWarning & {
	nearestDays: number;
};

function formatDate(value: string) {
	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatDays(days: number) {
	if (days < 0) return `${Math.abs(days)}d overdue`;
	if (days === 0) return "today";
	return `${days}d`;
}

function getUrgencyClasses(days: number) {
	if (days < 0) {
		return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300";
	}
	if (days <= 7) {
		return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300";
	}
	if (days <= 30) {
		return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
	}
	return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300";
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

function EventChip({
	label,
	days,
	date,
}: {
	label: "Dep" | "Ret";
	days: number;
	date: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"h-5 gap-1 px-1.5 text-[11px] font-mono tabular-nums",
				getUrgencyClasses(days),
			)}
		>
			<span className="font-semibold">{label}</span>
			<span>{formatDays(days)}</span>
			<span className="opacity-70">{formatDate(date)}</span>
		</Badge>
	);
}

function LifecycleRow({ row }: { row: ModelLifecycle }) {
	const hasReadableName =
		Boolean(row.modelName?.trim()) && row.modelName?.trim() !== row.modelId;

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-2">
					<span
						className={cn(
							"h-1.5 w-1.5 shrink-0 rounded-full",
							row.nearestDays <= 7 ? "bg-rose-500" : "bg-amber-500",
						)}
					/>
					<ModelLink
						modelId={row.modelId}
						modelName={row.modelName}
						organisationId={row.organisationId}
						className="truncate text-sm font-medium"
					/>
				</div>
				{hasReadableName ? (
					<div className="mt-0.5 truncate text-[11px] font-mono text-muted-foreground">
						{row.modelId}
					</div>
				) : null}
				{row.replacementModelId ? (
					<div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
						<ArrowRight className="h-3 w-3 shrink-0" />
						<span className="shrink-0">Replace with</span>
						<ModelLink
							modelId={row.replacementModelId}
							modelName={null}
							organisationId={deriveOrganisationId(row.replacementModelId, null)}
							className="truncate font-medium text-foreground"
						/>
					</div>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-1.5">
				{row.deprecationDate && row.deprecationDaysUntil !== null ? (
					<EventChip
						label="Dep"
						days={row.deprecationDaysUntil}
						date={row.deprecationDate}
					/>
				) : null}
				{row.retirementDate && row.retirementDaysUntil !== null ? (
					<EventChip
						label="Ret"
						days={row.retirementDaysUntil}
						date={row.retirementDate}
					/>
				) : null}
			</div>
		</div>
	);
}

function toLifecycleRows(warnings: DeprecationWarning[]): ModelLifecycle[] {
	return warnings
		.map((warning) => {
			const candidates = [warning.deprecationDaysUntil, warning.retirementDaysUntil]
				.filter((value): value is number => Number.isFinite(value));
			const nearestDays = candidates.length ? Math.min(...candidates) : 9999;
			return {
				...warning,
				nearestDays,
			};
		})
		.sort((a, b) => a.nearestDays - b.nearestDays);
}

export default async function DeprecationWarnings() {
	const teamId = await getTeamIdFromCookie();
	if (!teamId) return null;

	const warnings = await getDeprecationWarningsForTeam(teamId);
	if (!warnings.length) return null;

	const rows = toLifecycleRows(warnings);
	const visibleRows = rows.slice(0, 5);
	const hiddenRows = rows.slice(5);

	const overdueCount = rows.filter((row) => row.nearestDays < 0).length;
	const next7DaysCount = rows.filter(
		(row) => row.nearestDays >= 0 && row.nearestDays <= 7,
	).length;

	return (
		<div className="mt-4 space-y-2">
			<div className="flex items-center gap-2">
				<h3 className="text-base font-semibold">Lifecycle Alerts</h3>
				<Separator className="flex-1" />
			</div>

			<section className="overflow-hidden rounded-xl border bg-card">
				<div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2.5">
					<div className="mr-1 flex items-center gap-1.5">
						<AlertTriangle className="h-4 w-4 text-amber-600" />
						<span className="text-sm font-medium">Recently used models</span>
					</div>
					<Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
						{rows.length}
					</Badge>
					{next7DaysCount > 0 ? (
						<Badge
							variant="outline"
							className="h-5 border-rose-300 bg-rose-50 px-1.5 text-[11px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
						>
							{next7DaysCount} in 7d
						</Badge>
					) : null}
					{overdueCount > 0 ? (
						<Badge
							variant="outline"
							className="h-5 border-red-300 bg-red-50 px-1.5 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
						>
							{overdueCount} overdue
						</Badge>
					) : null}
				</div>

				<div className="divide-y">
					{visibleRows.map((row) => (
						<LifecycleRow key={row.modelId} row={row} />
					))}
				</div>

				{hiddenRows.length > 0 ? (
					<details className="border-t">
						<summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
							Show {hiddenRows.length} more
						</summary>
						<div className="divide-y border-t">
							{hiddenRows.map((row) => (
								<LifecycleRow key={`${row.modelId}-more`} row={row} />
							))}
						</div>
					</details>
				) : null}
			</section>
		</div>
	);
}
