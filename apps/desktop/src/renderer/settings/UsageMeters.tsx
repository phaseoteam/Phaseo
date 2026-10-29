import { formatDateParts, formatTime, formatUsd, MONEY_LOCALE } from "@phaseo/app-kit/format";
import type { AccountStatus, UsageWindow } from "../../shared/workspace";
import { cn } from "../lib/utils";
import { RedactedText } from "../components/RedactedText";

/** "5-hour", "Weekly" and so on, from a window's length. */
export function windowName(minutes: number | null, fallback: string) {
	if (minutes === null) return fallback;
	if (minutes === 10080) return "Weekly";
	if (minutes === 1440) return "Daily";
	if (minutes % 1440 === 0) return `${minutes / 1440}-day`;
	if (minutes % 60 === 0) return `${minutes / 60}-hour`;
	return `${minutes}-minute`;
}

/** "Resets in 2h 14m", or the date when it is more than a day away. */
export function resetText(resetsAt: number | null, now = Date.now()) {
	if (resetsAt === null) return "";
	const minutes = Math.max(0, Math.round((resetsAt * 1000 - now) / 60000));
	if (minutes < 60) return `Resets in ${minutes}m`;
	if (minutes < 1440) return `Resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
	return `Resets ${formatDateParts(resetsAt * 1000, { weekday: "short", day: "numeric", month: "short" })}`;
}

export function UsageMeter({ label, window, compact }: { label: string; window: UsageWindow | null; compact?: boolean }) {
	if (!window) return <div className="text-xs text-muted-foreground">{label}: unavailable</div>;
	const used = Math.round(window.usedPercent), left = Math.max(0, 100 - used);
	const name = windowName(window.windowDurationMins, label);
	return <div className="flex min-w-0 flex-col gap-1.5">
		<div className="flex items-baseline gap-2 text-xs">
			<span className="font-semibold text-foreground">{name}</span>
			<span className="text-muted-foreground">{left}% left</span>
			{!compact && <span className="ml-auto text-muted-foreground">{resetText(window.resetsAt)}</span>}
		</div>
		<div role="progressbar" aria-label={`${name} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} className="h-1.5 overflow-hidden rounded-full bg-muted">
			<div className={cn("h-full rounded-full transition-[width]", used >= 90 ? "bg-destructive" : used >= 70 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(used, used > 0 ? 2 : 0)}%` }} />
		</div>
		{compact && window.resetsAt !== null && <span className="text-[11px] text-muted-foreground">{resetText(window.resetsAt)}</span>}
	</div>;
}

/** Dollars as the website's budgets show them; another currency in the same US style ("€12.50"). */
const money = (value: number | null, currency = "USD") => value === null ? "unknown" : currency === "USD" ? formatUsd(value) : new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency }).format(value);

/** A native login's plan and limit windows, as the agent reported them. */
export function UsageMeters({ status }: { status: AccountStatus }) {
	return <div className="account-status flex flex-col gap-3">
		<p className="text-xs text-muted-foreground">
			{status.authenticated === true ? "Signed in" : status.authenticated === false ? "Sign-in required" : "Sign-in status unavailable"}
			{status.plan ? ` · ${status.plan}` : ""}{status.identity && <> · <RedactedText text={status.identity} /></>}{status.method ? ` · ${status.method}` : ""}
		</p>
		{status.ordinaryUsageAllowed === false && <p className="text-xs text-destructive">Included usage is used up; further use is billed separately.</p>}
		{status.usage?.map(bucket => <div key={bucket.id} className="flex flex-col gap-2">
			{(status.usage?.length ?? 0) > 1 && <p className="text-xs font-semibold">{bucket.name}</p>}
			{bucket.spendControlReached === true && <p className="text-xs text-destructive">Spend limit reached.</p>}
			{/* Only the windows the agent reports; a bucket with none says so once. */}
			{bucket.primary || bucket.secondary ? <div className="grid grid-cols-2 gap-4">
				{bucket.primary && <UsageMeter label={bucket.name} window={bucket.primary} />}
				{bucket.secondary && <UsageMeter label={bucket.name} window={bucket.secondary} />}
			</div> : <p className="text-xs text-muted-foreground">{bucket.name}: no limit reported</p>}
		</div>)}
		{status.extraUsage?.enabled && <p className="text-xs text-muted-foreground">Extra usage: {money(status.extraUsage.used, status.extraUsage.currency)} used{status.extraUsage.limit !== null ? ` of ${money(status.extraUsage.limit, status.extraUsage.currency)} this month` : ""}</p>}
		{status.usageError && <p className="text-xs text-muted-foreground">{status.usageError}</p>}
		<p className="text-[11px] text-muted-foreground/80">Checked {formatTime(status.checkedAt)}</p>
	</div>;
}
