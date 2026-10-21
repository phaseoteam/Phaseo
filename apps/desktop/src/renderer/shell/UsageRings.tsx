import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { HarnessLogo } from "../components/HarnessLogo";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { cn } from "../lib/utils";
import { RedactedText } from "../components/RedactedText";
import { AccountChip, providerNames } from "../settings/UsageLimits";
import { resetText } from "../settings/UsageMeters";
import { checkAllUsage, refreshUsageIfStale, usageAccounts, usageChecking, usageLocals, useUsageLimits } from "../settings/usageLimitsStore";
import { tierTag, usagePools, usageRings, type ProviderRings, type RingAccount, type UsageRing } from "../settings/usagePools";
import { relativeTime } from "../views/pullRequests/pullRequestLogic";

const minute = 60_000;
/** Colour only says how much is left, never which provider: the logo beside each pair does that. */
const tone = (remaining: number) => remaining <= 10 ? "text-destructive" : remaining <= 25 ? "text-warning" : "text-foreground/85";

/**
 * One provider's pair: the weekly window as the outer ring, the 5-hour window inside it. Each ring empties as it is
 * used. With several accounts the outer ring has one arc per account, each emptying on its own.
 */
function RingPair({ rings, size = 22 }: { rings: ProviderRings; size?: number }) {
	const arc = (remaining: number, radius: number, key: string, part = 0, parts = 1) => {
		const length = 2 * Math.PI * radius;
		// Split arcs have square ends and a thin gap, so six of them still read as a ring rather than dots.
		const gap = parts > 1 ? 1.75 : 0, span = length / parts - gap;
		return remaining > 0 && <circle key={key} cx={11} cy={11} r={radius} fill="none" strokeWidth={2.5} strokeLinecap={parts > 1 ? "butt" : "round"} stroke="currentColor"
			transform={`rotate(${-90 + part * 360 / parts + gap / 2 / length * 360} 11 11)`} strokeDasharray={`${Math.max(0.01, span * remaining / 100)} ${length}`}
			className={cn("transition-[stroke-dasharray] duration-500", tone(remaining))} />;
	};
	const track = (radius: number) => <circle cx={11} cy={11} r={radius} fill="none" strokeWidth={2.5} className="stroke-muted-foreground/15" />;
	return <svg aria-hidden viewBox="0 0 22 22" width={size} height={size} className="shrink-0">
		{track(9.25)}{rings.inner && track(4.75)}
		{rings.segments ? rings.segments.map((remaining, index) => arc(remaining, 9.25, `outer-${index}`, index, rings.segments!.length)) : rings.outer && arc(rings.outer.remaining, 9.25, "outer")}
		{rings.inner && arc(rings.inner.remaining, 4.75, "inner")}
	</svg>;
}

const Logo = ({ provider }: { provider: ProviderRings["provider"] }) => <span className="flex size-3.5 shrink-0 items-center justify-center [&_img]:size-3.5 [&_.harness-logo]:size-3.5"><HarnessLogo harness={provider} /></span>;

function RingLine({ ring, pooled }: { ring: UsageRing; pooled?: boolean }) {
	return <div className="contents">
		<span className="whitespace-nowrap text-muted-foreground">{ring.label}</span>
		<span className={cn("font-medium tabular-nums", ring.remaining <= 25 && tone(ring.remaining))}>{ring.remaining}% left{pooled ? " overall" : ""}</span>
		<span className="text-right whitespace-nowrap text-muted-foreground">{resetText(ring.resetsAt)}</span>
	</div>;
}

/** One account of several: who it is, then what it has left in each window. */
function AccountLine({ value }: { value: RingAccount }) {
	const { account, inner, outer } = value;
	const figure = (ring: UsageRing | null) => ring && <span title={`${ring.label}: ${resetText(ring.resetsAt) || "no reset reported"}`} className={cn("tabular-nums", ring.remaining <= 25 ? tone(ring.remaining) : "text-muted-foreground")}>{ring.label === "5-hour" ? "5h" : ring.label === "Weekly" ? "wk" : ring.label.replace(/ weekly$/, "")} {ring.remaining}%</span>;
	return <div className="flex min-w-0 items-center gap-2">
		<AccountChip account={account} className="size-4.5 text-[8px]" />
		<span className="min-w-0 flex-1 truncate">{account.email ? <RedactedText text={account.email} /> : account.label}</span>
		{figure(inner)}{figure(outer)}
	</div>;
}

/**
 * The sidebar's limit rings, one pair per subscription provider, with each window's figure and reset on hover.
 * Each check starts an agent or calls a hub, so they are read on launch, after turns end and when opened, at most
 * every few minutes, and never for someone whose last check found no subscription.
 */
export function UsageRings() {
	const { api, overview, openSettings } = useWorkspace();
	const limits = useUsageLimits();
	const locals = useMemo(() => usageLocals(overview.accounts), [overview.accounts]);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), minute); return () => window.clearInterval(timer); }, []);
	const rings = useMemo(() => usageRings(usagePools(usageAccounts(locals, limits)), now), [locals, limits, now]);
	// A check that failed (an agent timing out, a hub offline) is tried again; only finding no subscription stops checks.
	const failed = Object.values(limits.statuses).some(status => typeof status === "object" && "error" in status) || Object.values(limits.snapshots).some(snapshot => typeof snapshot === "object" && Boolean(snapshot.error));
	const tracked = rings.length > 0 || limits.checkedAt === undefined || failed;
	const refresh = (maxAge: number) => { if (api && tracked) refreshUsageIfStale(api, locals, maxAge); };
	useEffect(() => { refresh(5 * minute); }, [api]);
	// A turn that ends has used some of the window, so the rings are read again then.
	const running = overview.tasks.filter(task => task.status === "running").length, previous = useRef(running);
	useEffect(() => { if (running < previous.current) refresh(5 * minute); previous.current = running; }, [running]);
	if (!rings.length) return null;
	const busy = usageChecking(limits);
	const summary = rings.map(pair => [pair.tier ? `${providerNames[pair.provider]} ${pair.tier}` : providerNames[pair.provider], pair.inner && `${pair.inner.label} ${pair.inner.remaining}% left`, pair.outer && `${pair.outer.label} ${pair.outer.remaining}% left`].filter(Boolean).join(", ")).join("; ");
	return <div className="px-2.5 pt-2"><Popover onOpenChange={open => { if (open) refresh(minute); }}>
		<PopoverTrigger openOnHover delay={200} render={<button type="button" aria-label={`Usage limits: ${summary}`} className="flex h-8 w-full items-center gap-3 rounded-md px-2 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-sidebar-accent" />}>
			{rings.map(pair => <span key={pair.key} className="flex items-center gap-1"><Logo provider={pair.provider} />{pair.tier && <span className="text-2xs font-medium text-muted-foreground">{tierTag(pair.tier)}</span>}<RingPair rings={pair} /></span>)}
		</PopoverTrigger>
		<PopoverContent side="top" align="start" sideOffset={6} className="w-[22rem] gap-3 p-3 text-xs">
			{rings.map(pair => <section key={pair.key} aria-label={`${providerNames[pair.provider]}${pair.tier ? ` ${pair.tier}` : ""} limits`} className="flex flex-col gap-1.5">
				<h3 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold"><Logo provider={pair.provider} /><span className="shrink-0">{providerNames[pair.provider]}</span>{(pair.tier || pair.accounts.length > 1) && <span className="min-w-0 truncate font-normal text-muted-foreground">{[pair.tier, pair.accounts.length > 1 && `${pair.accounts.length} accounts`].filter(Boolean).join(" · ")}</span>}<span className="ml-auto"><RingPair rings={pair} size={18} /></span></h3>
				<div className="grid grid-cols-[5.5rem_auto_minmax(0,1fr)] gap-x-3 gap-y-1">
					{pair.inner && <RingLine ring={pair.inner} pooled={pair.accounts.length > 1} />}
					{pair.outer && <RingLine ring={pair.outer} pooled={pair.accounts.length > 1} />}
				</div>
				{pair.accounts.length > 1 && <div className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto">{pair.accounts.map(value => <AccountLine key={value.account.key} value={value} />)}</div>}
			</section>)}
			<div className="flex items-center gap-1 border-t border-border/60 pt-2 text-muted-foreground">
				<span className="min-w-0 flex-1 truncate">{busy ? "Checking…" : limits.checkedAt ? `Checked ${relativeTime(new Date(limits.checkedAt).toISOString(), now)}` : ""}</span>
				<button type="button" aria-label="Check limits again" title="Check again" disabled={busy || !api} onClick={() => { if (api) void checkAllUsage(api, locals); }} className="grid size-6 place-items-center rounded-md hover:bg-muted hover:text-foreground disabled:opacity-50"><RotateCw className={cn("size-3.5", busy && "animate-spin")} /></button>
				<button type="button" onClick={() => openSettings("usage")} className="rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-muted">Usage & limits</button>
			</div>
		</PopoverContent>
	</Popover></div>;
}
