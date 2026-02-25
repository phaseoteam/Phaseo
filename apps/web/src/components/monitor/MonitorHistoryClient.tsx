import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Logo } from "@/components/Logo";
// Use a module-level default for "now" so we don't call Date.now() during render.
const DEFAULT_NOW = Date.now();
const GITHUB_REPO = "https://github.com/AI-Stats/AI-Stats";

export type ChangeHistory = {
	id: string;
	timestamp: string;
	provider: string;
	model: string;
	endpoint: string;
	field: string;
	oldValue: any;
	newValue: any;
	percentChange?: number;
	action?: "added" | "changed" | "removed";
	commit?: string;
	entityId?: string;
	orgId?: string | null;
};

type ChangeKind = "added" | "removed" | "updated";

type GroupedChanges = {
	label: string;
	changes: ChangeHistory[];
};

const formatValue = (value: any) => {
	if (typeof value === "number") {
		if (Number.isFinite(value) && Math.abs(value) < 1)
			return value.toFixed(4);
		return value.toLocaleString();
	}
	if (typeof value === "boolean") return value ? "true" : "false";
	if (Array.isArray(value)) return value.join(", ");
	if (value == null) return "";
	return String(value);
};

const formatPercentChange = (change?: number) => {
	if (change === undefined || !Number.isFinite(change)) return null;
	const up = change > 0;
	return (
		<span
			className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
				up
					? "bg-green-600/10 text-green-500"
					: "bg-red-600/10 text-red-500"
			}`}
		>
			{up ? (
				<TrendingUp className="h-3 w-3" />
			) : (
				<TrendingDown className="h-3 w-3" />
			)}
			{up ? "+" : ""}
			{change.toFixed(1)}%
		</span>
	);
};

const getKind = (change: ChangeHistory): ChangeKind => {
	if (change.action === "added") return "added";
	if (change.action === "removed") return "removed";
	if (change.action === "changed") return "updated";
	const oldNull = change.oldValue == null;
	const newNull = change.newValue == null;
	if (oldNull && !newNull) return "added";
	if (!oldNull && newNull) return "removed";
	return "updated";
};

const groupChanges = (data: ChangeHistory[], now: number): GroupedChanges[] => {
	const groups: Record<
		string,
		{ sortKey: number; changes: ChangeHistory[] }
	> = {};

	for (const change of data) {
		const ts = new Date(change.timestamp).getTime();
		const diffMs = Math.max(0, now - ts);
		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		let label: string;

		if (diffMinutes < 5) label = "just now";
		else if (diffMinutes < 60)
			label =
				diffMinutes === 1
					? "1 minute ago"
					: `${diffMinutes} minutes ago`;
		else if (diffHours < 24)
			label = diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
		else if (diffDays < 30)
			label = diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
		else {
			const months = Math.floor(diffDays / 30);
			label = months === 1 ? "1 month ago" : `${months} months ago`;
		}

		if (!groups[label])
			groups[label] = { sortKey: diffMinutes, changes: [] };
		groups[label].sortKey = Math.min(groups[label].sortKey, diffMinutes);
		groups[label].changes.push(change);
	}

	return Object.entries(groups)
		.sort((a, b) => a[1].sortKey - b[1].sortKey)
		.map(([label, { changes }]) => ({
			label,
			changes: [...changes].sort(
				(a, b) =>
					new Date(b.timestamp).getTime() -
					new Date(a.timestamp).getTime()
			),
		}));
};

const getHref = (change: ChangeHistory) => {
	if (change.provider === "model") return `/models/${change.model}`;
	if (change.provider === "organisation")
		return change.entityId
			? `/organisations/${change.entityId}`
			: `/organisations/${change.model}`;
	if (change.provider === "api-provider")
		return `/api-providers/${change.model}`;
	if (change.provider === "benchmark") return `/benchmarks/${change.model}`;
	if (change.provider === "family") {
		return change.entityId ? `/families/${change.entityId}` : null;
	}
	if (change.provider === "subscription-plan") {
		return change.entityId ? `/subscription-plans/${change.entityId}` : null;
	}
	if (change.provider === "alias") return null;
	return null;
};

const getOrgId = (change: ChangeHistory) => {
	if (change.provider === "benchmark") return null;
	if (change.provider === "model") return change.model.split("/")[0] ?? null;
	if (change.provider === "organisation")
		return change.orgId ?? change.entityId ?? null;
	if (change.provider === "family") return change.orgId ?? null;
	if (change.provider === "subscription-plan") return change.orgId ?? null;
	if (change.provider === "alias") return change.orgId ?? null;
	return null;
};

const renderChangeRow = (change: ChangeHistory) => {
	const kind = getKind(change);
	const href = getHref(change);
	const orgId = getOrgId(change);
	const commitUrl = change.commit
		? `${GITHUB_REPO}/commit/${change.commit}`
		: null;

	const modelNode = href ? (
		<Link href={href} className="underline decoration-transparent hover:decoration-current transition-colors duration-200 font-medium">
			{change.model}
		</Link>
	) : (
		<span className="font-medium">{change.model}</span>
	);
	const showFamilyLabel = change.provider === "family";

	const endpointBadge = change.endpoint ? (
		<span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-medium">
			{change.endpoint}
		</span>
	) : null;

	const kindColor =
		kind === "added"
			? "text-green-500"
			: kind === "removed"
			? "text-red-500"
			: "text-sky-500";

	const verb =
		kind === "added"
			? "created"
			: kind === "removed"
			? "removed"
			: "updated";

	const planModelId =
		change.provider === "subscription-plan" &&
		change.field?.startsWith("models.")
			? change.field.replace("models.", "")
			: null;
	const planModelVerb =
		change.oldValue == null && change.newValue != null
			? "added"
			: change.oldValue != null && change.newValue == null
				? "removed"
				: "updated";
	const isAliasChange =
		change.provider === "alias" && change.field === "resolved_model_id";
	const aliasOld =
		isAliasChange && typeof change.oldValue === "string"
			? change.oldValue
			: null;
	const aliasNew =
		isAliasChange && typeof change.newValue === "string"
			? change.newValue
			: null;

	const renderValueBadge = (val: any, emptyPlaceholder = "") => {
		if (val === null)
			return (
				<span className="rounded border border-muted px-2 py-0.5 text-sm font-medium whitespace-normal break-words">
					null
				</span>
			);
		const empty =
			val === undefined ||
			(typeof val === "string" && val.trim() === "") ||
			(Array.isArray(val) && val.length === 0);
		if (empty)
			return (
				<span className="rounded border border-muted/40 px-2 py-0.5 text-sm whitespace-normal break-words">
					{emptyPlaceholder}
				</span>
			);
		return (
			<span className="rounded border border-muted px-2 py-0.5 text-sm font-medium whitespace-normal break-words">
				{formatValue(val)}
			</span>
		);
	};

	return (
		<li key={change.id} className="flex flex-wrap items-center gap-3">
			<div className="flex-shrink-0">
				{orgId ? (
					<div className="w-10 h-10 relative flex items-center justify-center rounded-xl border">
						<div className="w-7 h-7 relative">
							<Logo
								id={orgId}
								alt={change.model}
								className="object-contain"
								fill
							/>
						</div>
					</div>
				) : (
					<span className="inline-block h-2 w-2 rounded-full bg-muted-foreground" />
				)}
			</div>

			<div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
				{endpointBadge}

				<span className="text-sm break-words">
					{endpointBadge ? (
						<span className="sr-only">endpoint for</span>
					) : null}
					{endpointBadge ? (
						<span className="text-sm">endpoint for </span>
					) : null}
					<span className="font-medium">{modelNode}</span>
					{showFamilyLabel ? (
						<span className="text-sm"> family</span>
					) : null}
					<span className={`${kindColor} ml-2 text-sm font-semibold`}>
						{" "}
						was {verb}
					</span>
				</span>

				{kind === "updated" || planModelId || isAliasChange ? (
					<span className="text-muted-foreground">|</span>
				) : null}

				{kind === "updated" || planModelId || isAliasChange ? (
					<span className="flex flex-wrap items-center gap-2 text-muted-foreground">
						{renderValueBadge(
							isAliasChange
								? "alias"
								: planModelId
								? "models"
								: change.field ?? "field"
						)}
						{planModelId ? (
							<>
								{renderValueBadge(planModelId)}
								<span className="text-xs text-muted-foreground">
									was {planModelVerb}
								</span>
							</>
						) : (
							<>
								<span className="text-xs text-muted-foreground">from</span>
								{isAliasChange
									? renderValueBadge(aliasOld)
									: renderValueBadge(change.oldValue)}
								<span className="text-xs text-muted-foreground">to</span>
								{isAliasChange
									? renderValueBadge(aliasNew)
									: renderValueBadge(change.newValue)}
								{!isAliasChange
									? formatPercentChange(change.percentChange)
									: null}
							</>
						)}
					</span>
				) : null}
			</div>

			{commitUrl ? (
				<a
					href={commitUrl}
					target="_blank"
					rel="noreferrer"
					className="ml-auto flex items-center"
					aria-label={`View commit ${change.commit} on GitHub`}
				>
					<Logo
						id="github"
						alt="GitHub"
						width={16}
						height={16}
						className="opacity-70 hover:opacity-100"
					/>
				</a>
			) : null}
		</li>
	);
};

export function MonitorHistoryClient({
	data = [],
	now = DEFAULT_NOW,
}: {
	data?: ChangeHistory[];
	now?: number;
}) {
	const grouped = groupChanges(data, now);

	if (!grouped.length) {
		return (
			<div className="border rounded-lg bg-card p-6 text-sm text-muted-foreground">
				No changes match the current filters.
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<h2 className="text-lg font-semibold">Recent changes</h2>

			{grouped.map((group) => (
				<div key={group.label}>
					<div className="flex items-center gap-3">
						<div className="flex-grow border-t border-dashed border-muted-foreground/50" />
						<span className="px-3 py-1 text-xs rounded-full bg-muted text-muted-foreground">
							{group.label}
						</span>
						<div className="flex-grow border-t border-dashed border-muted-foreground/50" />
					</div>

					<ul className="mt-4 space-y-3">
						{group.changes.map((change) => renderChangeRow(change))}
					</ul>
				</div>
			))}
		</div>
	);
}

