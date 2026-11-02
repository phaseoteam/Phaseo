import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Pin, RotateCw } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { HarnessLogo } from "../components/HarnessLogo";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { ScrollArea } from "../components/ui/scroll-area";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { RedactedText } from "../components/RedactedText";
import { AccountChip, providerNames } from "../settings/UsageLimits";
import { resetText } from "../settings/UsageMeters";
import { checkAllUsage, refreshUsageIfStale, usageAccounts, usageChecking, usageLocals, useUsageLimits } from "../settings/usageLimitsStore";
import { rankRings, usagePools, usageRings, sidebarRings, type ProviderRings, type RingAccount, type UsageProvider, type UsageRing } from "../settings/usagePools";
import { formatRelativeTime } from "@phaseo/app-kit/format";

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

/** A pair's plan after its provider's name: "Max 20x" rather than "Claude Claude Max 20x". */
const planName = (pair: ProviderRings) => pair.tier?.startsWith(`${providerNames[pair.provider]} `) ? pair.tier.slice(providerNames[pair.provider].length + 1) : pair.tier;
const pairName = (pair: ProviderRings) => [providerNames[pair.provider], planName(pair)].filter(Boolean).join(" ");

/** "5h", "wk", "Fable": short enough for a line of figures. */
const shortLabel = (label: string) => label === "5-hour" ? "5h" : label === "Weekly" ? "wk" : label === "Daily" ? "day" : label.replace(/ weekly$/, "");

/** One account of several: who it is, then what it has left in each window. */
function AccountLine({ value }: { value: RingAccount }) {
	const { account, inner, outer } = value;
	const figure = (ring: UsageRing | null) => ring && <span title={`${ring.label}: ${resetText(ring.resetsAt) || "no reset reported"}`} className={cn("tabular-nums", ring.remaining <= 25 ? tone(ring.remaining) : "text-muted-foreground")}>{shortLabel(ring.label)} {ring.remaining}%</span>;
	return <div className="flex min-w-0 items-center gap-2">
		<AccountChip account={account} className="size-4.5 text-[8px]" />
		<span className="min-w-0 flex-1 truncate">{account.email ? <RedactedText text={account.email} /> : account.label}</span>
		{figure(inner)}{figure(outer)}
	</div>;
}

/**
 * One pair as a line of the popover's list: who, the rings and their figures. Opening it shows each window's reset
 * and, with several accounts, what each one has left.
 */
function PairLine({ pair, open, pinned, onToggle, onPin }: { pair: ProviderRings; open: boolean; pinned: boolean; onToggle: () => void; onPin: () => void }) {
	const name = pairName(pair);
	const rings = [pair.inner, pair.outer].filter((ring): ring is UsageRing => ring !== null);
	return <section aria-label={`${name} limits`} className="flex flex-col">
		<div className="group flex items-center gap-0.5 rounded-md hover:bg-muted/60">
			<button type="button" aria-expanded={open} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
				<Logo provider={pair.provider} />
				<span title={pair.accounts.length > 1 ? `${name} · ${pair.accounts.length} accounts` : name} className="min-w-0 flex-1 truncate"><span className="font-medium">{providerNames[pair.provider]}</span>{pair.tier && <span className="text-muted-foreground"> {planName(pair)}</span>}{pair.accounts.length > 1 && <span className="text-muted-foreground"> · {pair.accounts.length}</span>}</span>
				<RingPair rings={pair} size={18} />
				<span className="shrink-0 text-right whitespace-nowrap tabular-nums">{rings.map((ring, index) => <Fragment key={ring.label}>{index > 0 && <span className="text-muted-foreground"> · </span>}<span className={ring.remaining <= 25 ? tone(ring.remaining) : "text-muted-foreground"}>{shortLabel(ring.label)} {ring.remaining}%</span></Fragment>)}</span>
			</button>
			<button type="button" aria-label={pinned ? `Unpin ${name} from the sidebar` : `Pin ${name} to the sidebar`} aria-pressed={pinned} title={pinned ? "Pinned to the sidebar" : "Pin to the sidebar"} onClick={onPin}
				className={cn("grid size-6 shrink-0 place-items-center rounded-md hover:bg-muted hover:text-foreground focus-visible:opacity-100", pinned ? "text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100")}><Pin className={cn("size-3", pinned && "fill-current")} /></button>
		</div>
		{open && <div className="mt-0.5 mr-7 mb-1.5 ml-7 flex flex-col gap-1.5">
			<div className="grid grid-cols-[5.5rem_auto_minmax(0,1fr)] gap-x-3 gap-y-1">{rings.map(ring => <RingLine key={ring.label} ring={ring} pooled={pair.accounts.length > 1} />)}</div>
			{pair.accounts.length > 1 && <div className="flex flex-col gap-1">{pair.accounts.map(value => <AccountLine key={value.account.key} value={value} />)}</div>}
		</div>}
	</section>;
}

const Heading = ({ children }: { children: string }) => <h3 className="flex items-center gap-2 px-1.5 pt-1 text-2xs font-medium text-muted-foreground/70">{children}<span className="h-px flex-1 bg-border/60" /></h3>;

/**
 * The sidebar's limit rings: the pairs that matter most (running low, in use, pinned, tightest) in one row that always
 * fits, a count for the rest, and every pair as a line of the popover.
 * Each check starts an agent or calls a hub, so they are read on launch, after turns end and when opened, at most
 * every few minutes, and never for someone whose last check found no subscription.
 */
export function UsageRings() {
	const { api, overview, openUsage, selectedId } = useWorkspace();
	const limits = useUsageLimits();
	const locals = useMemo(() => usageLocals(overview.accounts), [overview.accounts]);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), minute); return () => window.clearInterval(timer); }, []);
	const [pins, setPins] = usePersistedState<string[]>("phaseo.desktop.usagePins", []);
	const [opened, setOpened] = useState<string[]>([]);
	const rings = useMemo(() => usageRings(usagePools(usageAccounts(locals, limits)), now), [locals, limits, now]);
	// What is in use: the open chat's agent and anything running now.
	const inUse = useMemo(() => new Set(overview.tasks.filter(task => task.id === selectedId || task.status === "running").map(task => task.harness as UsageProvider)), [overview.tasks, selectedId]);
	const ranked = useMemo(() => rankRings(rings, { inUse, pinned: new Set(pins) }), [rings, inUse, pins]);
	const { shown: row, hidden } = sidebarRings(ranked), shown = row.length;
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
	const summary = ranked.map(pair => [pairName(pair), pair.inner && `${pair.inner.label} ${pair.inner.remaining}% left`, pair.outer && `${pair.outer.label} ${pair.outer.remaining}% left`].filter(Boolean).join(", ")).join("; ");
	const toggle = (list: string[], key: string) => list.includes(key) ? list.filter(value => value !== key) : [...list, key];
	const line = (pair: ProviderRings) => <PairLine key={pair.key} pair={pair} open={ranked.length === 1 || opened.includes(pair.key)} pinned={pins.includes(pair.key)}
		onToggle={() => setOpened(current => toggle(current, pair.key))} onPin={() => setPins(current => toggle(current, pair.key))} />;
	return <div className="px-2.5 pt-2"><Popover onOpenChange={open => { if (open) refresh(minute); }}>
		<PopoverTrigger openOnHover delay={200} render={<button type="button" aria-label={`Usage limits: ${summary}`} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-sidebar-accent" />}>
			{row.map(({ pair, tag }) => <span key={pair.key} className="flex items-center gap-1"><Logo provider={pair.provider} />{tag && <span className="text-2xs font-medium text-muted-foreground">{tag}</span>}<RingPair rings={pair} /></span>)}
			{hidden > 0 && <span className="rounded-md bg-muted-foreground/15 px-1 py-px text-2xs font-semibold text-muted-foreground tabular-nums">+{hidden}</span>}
		</PopoverTrigger>
		<PopoverContent side="top" align="start" sideOffset={6} className="w-[24rem] gap-2 p-2 text-xs">
			<ScrollArea className="max-h-96" viewportClassName="max-h-96">
				<div className="flex flex-col gap-0.5">
					{hidden > 0 && <Heading>In the sidebar</Heading>}
					{ranked.slice(0, shown).map(line)}
					{hidden > 0 && <Heading>Also tracked</Heading>}
					{ranked.slice(shown).map(line)}
				</div>
			</ScrollArea>
			<div className="flex items-center gap-1 border-t border-border/60 px-1 pt-2 text-muted-foreground">
				<span className="min-w-0 flex-1 truncate">{busy ? "Checking…" : limits.checkedAt ? `Checked ${formatRelativeTime(new Date(limits.checkedAt).toISOString(), now)}` : ""}</span>
				<button type="button" aria-label="Check limits again" title="Check again" disabled={busy || !api} onClick={() => { if (api) void checkAllUsage(api, locals); }} className="grid size-6 place-items-center rounded-md hover:bg-muted hover:text-foreground disabled:opacity-50"><RotateCw className={cn("size-3.5", busy && "animate-spin")} /></button>
				<button type="button" onClick={() => openUsage("limits")} className="rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-muted">Usage & limits</button>
			</div>
		</PopoverContent>
	</Popover></div>;
}
