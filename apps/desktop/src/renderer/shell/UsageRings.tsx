import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { HarnessLogo } from "../components/HarnessLogo";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { cn } from "../lib/utils";
import { providerFill, providerNames } from "../settings/UsageLimits";
import { resetText } from "../settings/UsageMeters";
import { checkAllUsage, refreshUsageIfStale, usageAccounts, usageChecking, usageLocals, useUsageLimits } from "../settings/usageLimitsStore";
import { usagePools, usageRings, type ProviderRings, type UsageRing } from "../settings/usagePools";
import { relativeTime } from "../views/pullRequests/pullRequestLogic";

const minute = 60_000;
/** Below this much left a ring turns red, whatever the provider's colour. */
const low = 10;

/** One provider's pair: the weekly window as the outer ring, the 5-hour window inside it. Each ring empties as it is used. */
function RingPair({ rings, size = 22 }: { rings: ProviderRings; size?: number }) {
	const arc = (ring: UsageRing | null, radius: number) => {
		const length = 2 * Math.PI * radius;
		return <g className={ring && ring.remaining <= low ? "text-destructive" : undefined}>
			<circle cx={11} cy={11} r={radius} fill="none" strokeWidth={2.5} className="stroke-muted-foreground/15" />
			{ring && ring.remaining > 0 && <circle cx={11} cy={11} r={radius} fill="none" strokeWidth={2.5} strokeLinecap="round" transform="rotate(-90 11 11)"
				stroke={ring.remaining <= low ? "currentColor" : providerFill[rings.provider]} strokeDasharray={`${length * ring.remaining / 100} ${length}`} className="transition-[stroke-dasharray] duration-500" />}
		</g>;
	};
	return <svg aria-hidden viewBox="0 0 22 22" width={size} height={size} className="shrink-0">{arc(rings.outer, 9.25)}{arc(rings.inner, 4.75)}</svg>;
}

function RingLine({ ring }: { ring: UsageRing }) {
	return <div className="contents">
		<span className="text-muted-foreground">{ring.label}</span>
		<span className={cn("font-medium tabular-nums", ring.remaining <= low && "text-destructive")}>{ring.remaining}% left</span>
		<span className="text-right text-muted-foreground">{resetText(ring.resetsAt)}</span>
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
	const tracked = rings.length > 0 || limits.checkedAt === undefined;
	const refresh = (maxAge: number) => { if (api && tracked) refreshUsageIfStale(api, locals, maxAge); };
	useEffect(() => { refresh(5 * minute); }, [api]);
	// A turn that ends has used some of the window, so the rings are read again then.
	const running = overview.tasks.filter(task => task.status === "running").length, previous = useRef(running);
	useEffect(() => { if (running < previous.current) refresh(5 * minute); previous.current = running; }, [running]);
	if (!rings.length) return null;
	const busy = usageChecking(limits);
	const summary = rings.map(pair => [providerNames[pair.provider], pair.inner && `${pair.inner.label} ${pair.inner.remaining}% left`, pair.outer && `${pair.outer.label} ${pair.outer.remaining}% left`].filter(Boolean).join(", ")).join("; ");
	return <Popover onOpenChange={open => { if (open) refresh(minute); }}>
		<PopoverTrigger openOnHover delay={200} render={<button type="button" aria-label={`Usage limits: ${summary}`} className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-sidebar-accent" />}>
			{rings.map(pair => <RingPair key={pair.provider} rings={pair} />)}
		</PopoverTrigger>
		<PopoverContent side="top" align="end" sideOffset={8} className="w-76 gap-3 p-3 text-xs">
			{rings.map(pair => <section key={pair.provider} aria-label={`${providerNames[pair.provider]} limits`} className="flex flex-col gap-1.5">
				<h3 className="flex items-center gap-2 text-[13px] font-semibold"><span className="flex size-4 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4"><HarnessLogo harness={pair.provider} /></span>{providerNames[pair.provider]}<span className="ml-auto"><RingPair rings={pair} size={18} /></span></h3>
				<div className="grid grid-cols-[4.5rem_auto_minmax(0,1fr)] gap-x-3 gap-y-1">
					{pair.inner && <RingLine ring={pair.inner} />}
					{pair.outer && <RingLine ring={pair.outer} />}
				</div>
			</section>)}
			<div className="flex items-center gap-1 border-t border-border/60 pt-2 text-muted-foreground">
				<span className="min-w-0 flex-1 truncate">{busy ? "Checking…" : limits.checkedAt ? `Checked ${relativeTime(new Date(limits.checkedAt).toISOString(), now)}` : ""}</span>
				<button type="button" aria-label="Check limits again" title="Check again" disabled={busy || !api} onClick={() => { if (api) void checkAllUsage(api, locals); }} className="grid size-6 place-items-center rounded-md hover:bg-muted hover:text-foreground disabled:opacity-50"><RotateCw className={cn("size-3.5", busy && "animate-spin")} /></button>
				<button type="button" onClick={() => openSettings("usage")} className="rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-muted">Usage & limits</button>
			</div>
		</PopoverContent>
	</Popover>;
}
