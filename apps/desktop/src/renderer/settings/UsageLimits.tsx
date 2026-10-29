import { formatDateParts } from "@phaseo/app-kit/format";
import { RotateCw } from "lucide-react";
import { cn } from "../lib/utils";
import { HarnessLogo } from "../components/HarnessLogo";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { resetText } from "./UsageMeters";
import { RedactedText } from "../components/RedactedText";
import { accountHue, initials, type PoolColumn, type PoolWindow, type ProviderPool, type UsageAccount } from "./usagePools";

export const providerNames: Record<ProviderPool["provider"], string> = { codex: "Codex", claude: "Claude", cursor: "Cursor", grok: "Grok" };
/** The bar's fill per provider, drawn at low opacity so text on it stays readable in any theme. */
export const providerFill: Record<ProviderPool["provider"], string> = { codex: "#339cff", claude: "#d97757", cursor: "#a1a1aa", grok: "#a1a1aa" };

/** Two initials on a colour that stays the same for an account everywhere. */
export function AccountChip({ account, className }: { account: UsageAccount; className?: string }) {
	const name = account.email ?? account.label, hue = accountHue(name);
	return <span role="img" aria-label={`Account ${initials(name)}`} style={{ background: `oklch(0.62 0.11 ${hue} / 0.28)`, color: `oklch(0.78 0.12 ${hue})` }}
		className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[9px] leading-none font-bold", className)}>{initials(name)}</span>;
}

function countdown(resetsAt: number | null) { return resetText(resetsAt).replace(/^Resets (in )?/, ""); }

/** One account's share of a window; hovering or clicking shows its details, with the email still blurred. */
function Segment({ column, provider, compact }: { column: PoolColumn; provider: ProviderPool["provider"]; compact: boolean }) {
	const { account, remaining, resetsAt } = column;
	const details: [string, string][] = [["Plan", account.status.plan ?? "Unknown"], ["Via", account.source], ["Left", `${remaining}%`], ...resetsAt !== null ? [["Resets", `${formatDateParts(resetsAt * 1000, { weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${countdown(resetsAt)}`] as [string, string]] : []];
	return <Popover>
		<PopoverTrigger openOnHover delay={250} render={<button type="button" aria-label={`${initials(account.email ?? account.label)}: ${remaining}% left${resetsAt !== null ? `, resets ${countdown(resetsAt)}` : ""}`}
			className="relative h-8 min-w-0 overflow-hidden rounded-md bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:ring-2 data-popup-open:ring-ring/40" />}>
			<span className="absolute inset-y-0 left-0 opacity-35" style={{ width: `${remaining}%`, background: providerFill[provider] }} />
			{resetsAt !== null && remaining < 100 && <span className="absolute inset-y-0 right-0 opacity-20" style={{ width: `${100 - remaining}%`, background: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 5px)" }} />}
			<span className="relative flex h-full items-center gap-1.5 px-1.5 text-xs">
				<AccountChip account={account} />
				<span className="font-semibold tabular-nums">{remaining}%</span>
				{!compact && resetsAt !== null && <span className="ml-auto truncate rounded-sm bg-background/80 px-1 text-[10.5px] text-muted-foreground">↻ {countdown(resetsAt)}</span>}
			</span>
		</PopoverTrigger>
		<PopoverContent side="top" sideOffset={6} className="w-72 gap-2.5 p-3 text-xs">
			<div className="flex items-center gap-2">
				<AccountChip account={account} />
				{account.email ? <RedactedText text={account.email} className="text-[13px] font-medium" /> : <span className="truncate text-[13px] font-medium">{account.label}</span>}
			</div>
			<div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border/60 pt-2.5">
				{details.map(([label, value]) => <div key={label} className="contents"><span className="text-muted-foreground">{label}</span><span className="truncate tabular-nums">{value}</span></div>)}
			</div>
		</PopoverContent>
	</Popover>;
}

/** A pooled window: how much is left across every account, and each account's share as a segment. */
function PoolCard({ pool, provider }: { pool: PoolWindow; provider: ProviderPool["provider"] }) {
	const compact = pool.columns.length > 4;
	return <div className="grid items-center gap-x-6 gap-y-3 border-t border-border/60 py-4 first:border-t-0 first:pt-1 md:grid-cols-[9.5rem_minmax(0,1fr)]">
		<div className="flex flex-col gap-0.5">
			<span className="text-[13px] font-medium">{pool.label}</span>
			<span className="flex items-baseline gap-1.5"><span className="text-3xl font-semibold tabular-nums">{pool.remaining}%</span><span className="text-sm text-muted-foreground">left</span></span>
			{pool.nextRefill && pool.columns.length > 1 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><RotateCw className="size-3" />+{pool.nextRefill.restores}% in {countdown(pool.nextRefill.at)}</span>}
			{pool.columns.length === 1 && pool.columns[0].resetsAt !== null && <span className="text-xs text-muted-foreground">{resetText(pool.columns[0].resetsAt)}</span>}
		</div>
		<div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${pool.columns.length}, minmax(0, 1fr))` }}>
			{pool.columns.map(column => <Segment key={column.account.key} column={column} provider={provider} compact={compact} />)}
		</div>
	</div>;
}

export function ProviderPoolSection({ pool }: { pool: ProviderPool }) {
	const accounts = pool.windows[0]?.columns.length ?? 0;
	return <section aria-label={`${providerNames[pool.provider]} limits`} className="flex flex-col gap-2.5">
		<h2 className="flex items-center gap-2 px-0.5 text-[13.5px] font-bold">
			<span className="flex size-5 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4"><HarnessLogo harness={pool.provider} /></span>
			{providerNames[pool.provider]}<span className="font-normal text-muted-foreground">· {accounts === 1 ? "1 account" : `${accounts} accounts`}</span>
		</h2>
		<div className="flex flex-col pl-7">{pool.windows.map(window => <PoolCard key={window.id} pool={window} provider={pool.provider} />)}</div>
	</section>;
}
