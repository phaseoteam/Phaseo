import { ArrowDownToLine, Minus, RefreshCw, Search, Settings, Square, X } from "lucide-react";
import { stageLabel } from "../../shared/stages";
import type { FactorySnapshot } from "../../shared/types";
import { AgentMark, BrandMark } from "../components/Marks";
import { RepoPicker } from "../components/RepoPicker";
import { Button } from "../components/ui/button";
import { Kbd } from "../components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Tip } from "../components/ui/tooltip";
import { duration } from "../lib/format";
import { factory, href, useNow, type Route } from "../lib/useFactory";
import { cn } from "../lib/utils";

/** Shows only while agents are working: how many, and on click, each run with a way to it and a Stop. */
function Running({ snapshot }: { snapshot: FactorySnapshot }) {
	const now = useNow();
	const runs = snapshot.runs.filter((run) => run.status === "running").sort((a, b) => a.startedAt - b.startedAt);
	if (!runs.length) return null;
	return <Popover>
		<PopoverTrigger render={<button type="button" className="no-drag flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm whitespace-nowrap hover:bg-accent/60">
			<span className="relative flex size-2">
				<span className="absolute inline-flex size-full animate-ping rounded-[2px] bg-info opacity-60" />
				<span className="relative inline-flex size-2 rounded-[2px] bg-info" />
			</span>
			<span className="tabular-nums"><span className="font-semibold">{runs.length}</span><span className="hidden text-muted-foreground @2xl:inline"> running</span></span>
		</button>} />
		<PopoverContent align="end" className="w-96 p-1.5">
			<p className="px-2 pt-1 pb-1.5 text-xs font-semibold">{runs.length === 1 ? "1 agent working" : `${runs.length} agents working`}</p>
			{runs.map((run) => {
				const item = snapshot.items.find((candidate) => candidate.id === run.itemId);
				const agent = snapshot.agents.find((candidate) => candidate.id === run.agentId);
				return <div key={run.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/60">
					<AgentMark agent={agent} className="size-4 shrink-0" />
					<a href={item ? href({ page: "work", item: item.id, tab: "runs" }) : undefined} className="min-w-0 flex-1">
						<span className="block truncate text-sm">{item ? `#${item.number} ${item.title}` : run.itemId}</span>
						<span className="block truncate text-2xs text-muted-foreground">{stageLabel(run.stage)} · {agent?.label ?? run.agentId} · {duration(now - run.startedAt)}</span>
					</a>
					<Button variant="ghost" size="xs" className="shrink-0 text-muted-foreground" onClick={() => void factory().cancelRun(run.id)}>Stop</Button>
				</div>;
			})}
		</PopoverContent>
	</Popover>;
}

function WindowControls() {
	if (factory().platform === "darwin") return null;
	const control = "no-drag grid h-full w-11 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground";
	return <div className="-mr-3 flex h-12 self-start">
		<button type="button" aria-label="Minimize" className={control} onClick={() => void factory().windowAction("minimize")}><Minus className="size-4" /></button>
		<button type="button" aria-label="Maximize" className={control} onClick={() => void factory().windowAction("maximize")}><Square className="size-3" /></button>
		<button type="button" aria-label="Close" className={cn(control, "hover:bg-destructive hover:text-white")} onClick={() => void factory().windowAction("close")}><X className="size-4" /></button>
	</div>;
}

export function TopBar({ snapshot, route, onSearch }: { snapshot: FactorySnapshot; route: Route; onSearch: () => void }) {
	const mac = factory().platform === "darwin";

	// Narrow windows drop words before they drop controls: the search box becomes an icon, the running count loses its word.
	return <header className="drag-region @container shrink-0 border-b bg-background">
		<div className={cn("flex h-12 min-w-0 items-center gap-2 px-3", mac && "pl-20")}>
			<a href={href({ page: "work" })} className="no-drag flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/60">
				<BrandMark />
				<span className="hidden text-sm font-semibold @xl:inline">Factory</span>
			</a>
			<span className="text-muted-foreground/50 select-none">/</span>
			<RepoPicker className="@2xl:min-w-28 [&>span]:hidden @2xl:[&>span]:inline" snapshot={snapshot} all value={snapshot.settings.showRepo} onChange={(showRepo) => void factory().updateSettings({ showRepo })} />
			{snapshot.demo && <span className="hidden shrink-0 rounded-[4px] bg-warning/15 px-1.5 py-0.5 text-2xs font-medium text-warning @4xl:inline">Demo data</span>}

			<div className="flex-1" />

			<button type="button" onClick={onSearch} aria-label="Search" className="no-drag hidden h-8 w-72 shrink items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground hover:bg-muted/70 @5xl:flex">
				<Search className="size-4" />
				<span className="flex-1 truncate text-left">Search work, runs and agents</span>
				<Kbd>Ctrl K</Kbd>
			</button>
			<Tip label="Search (Ctrl K)">
				<button type="button" onClick={onSearch} aria-label="Search" className="no-drag grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground @5xl:hidden"><Search className="size-4" /></button>
			</Tip>
			<Running snapshot={snapshot} />
			<button type="button" aria-label="Refresh" onClick={() => void factory().refresh()} className="no-drag hidden size-8 shrink-0 place-items-center rounded-md @xl:grid text-muted-foreground hover:bg-accent/60 hover:text-foreground">
				<RefreshCw className="size-4" />
			</button>
			{snapshot.update?.latest && <Tip label={`Factory ${snapshot.update.latest.version} is out: see what's new`}>
				<a href={href({ page: "settings", tab: "general" })} className="no-drag flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-info/40 px-2.5 text-xs font-medium text-info hover:bg-info/10">
					<ArrowDownToLine className="size-3.5" />Update<span className="-ml-0.5 hidden @3xl:inline">to {snapshot.update.latest.version}</span>
				</a>
			</Tip>}
			<Tip label="Settings (Ctrl ,)">
				<a href={href({ page: "settings" })} aria-label="Settings" className={cn("no-drag grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent/60 hover:text-foreground", route.page === "settings" ? "bg-accent text-foreground" : "text-muted-foreground")}>
					<Settings className="size-4" />
				</a>
			</Tip>
			<WindowControls />
		</div>
	</header>;
}
