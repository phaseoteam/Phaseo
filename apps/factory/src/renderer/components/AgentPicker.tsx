import { ChevronDown, Gauge, Network, Search, Star } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { AgentProfile, Billing, Connection, FactorySnapshot } from "../../shared/types";
import { cn } from "../lib/utils";
import { AgentMark, harnessName } from "./Marks";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tip } from "./ui/tooltip";

const BILLING: Record<Billing, string> = { subscription: "Subscription", hub: "Hub", api: "API credits" };

export function billingLabel(agent: AgentProfile) {
	return BILLING[agent.billing];
}

export function agentName(agent: AgentProfile) {
	return `${harnessName(agent)} · ${agent.label}${agent.effort ? ` · ${effortLabel(agent.effort)}` : ""}`;
}

/** "xhigh" reads as "Extra high"; the rest just get a capital. */
export function effortLabel(effort: string) {
	return effort === "xhigh" ? "Extra high" : `${effort.charAt(0).toUpperCase()}${effort.slice(1)}`;
}

/** What each level is for, under its name in the effort menu. */
const EFFORT_HINT: Record<string, string> = {
	minimal: "Barely thinks first",
	low: "Quick answers to simple work",
	medium: "Balanced speed and depth",
	high: "Thinks hard on most work",
	xhigh: "Longer thinking for tricky work",
	max: "Thinks as long as it needs",
	ultra: "The deepest thinking it offers",
};

/**
 * How hard the agent thinks on this item, beside the agent: a gauge, the level, and a menu of the agent's
 * levels. "Default" leaves it to the agent's own setting, named so it's clear what that is.
 */
export function EffortPicker({ agent, value, onChange, className }: { agent: AgentProfile | undefined; value?: string; onChange: (effort: string | null) => void; className?: string }) {
	if (!agent?.efforts?.length) return null;
	const own = agent.effort ?? agent.defaultEffort;
	const chosen = value && agent.efforts.includes(value) ? value : undefined;
	const shown = chosen ?? own;
	return <DropdownMenu>
		<Tip label={chosen ? `${effortLabel(chosen)} effort on this item` : `${agent.label}'s own effort${own ? `: ${effortLabel(own)}` : ""}`}>
			<DropdownMenuTrigger render={<button type="button" aria-label="Reasoning effort" className={cn("inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2 text-sm font-medium whitespace-nowrap text-foreground/80 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent", className)}>
				<Gauge className="size-4 shrink-0 text-muted-foreground" />
				<span>{shown ? effortLabel(shown) : "Default"}</span>
				<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
			</button>} />
		</Tip>
		<DropdownMenuContent align="start" className="w-64">
			<DropdownMenuGroup>
				<DropdownMenuLabel>Effort on this item</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={chosen ?? ""} onValueChange={(next: string) => onChange(next || null)}>
					<DropdownMenuRadioItem value="" closeOnClick>
						<span className="flex min-w-0 flex-col">
							<span>Agent's setting</span>
							<span className="text-xs text-muted-foreground">{own ? `${effortLabel(own)}, from ${agent.effort ? "Settings" : agent.label}` : `Whatever ${agent.label} uses`}</span>
						</span>
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuRadioGroup value={chosen ?? ""} onValueChange={(next: string) => onChange(next || null)}>
					{agent.efforts.map((effort) => <DropdownMenuRadioItem key={effort} value={effort} closeOnClick>
						<span className="flex min-w-0 flex-col">
							<span className="flex items-center gap-1.5">
								{effortLabel(effort)}
								{effort === agent.defaultEffort && <span className="rounded-[4px] border px-1.5 text-2xs font-normal text-muted-foreground">Default</span>}
							</span>
							{EFFORT_HINT[effort] && <span className="text-xs text-muted-foreground">{EFFORT_HINT[effort]}</span>}
						</span>
					</DropdownMenuRadioItem>)}
				</DropdownMenuRadioGroup>
			</DropdownMenuGroup>
		</DropdownMenuContent>
	</DropdownMenu>;
}

/** Starred models, kept on this computer. */
const FAVORITES_KEY = "factory.favoriteAgents";

function useFavorites(): [Set<string>, (agentId: string) => void] {
	const [favorites, setFavorites] = useState(() => new Set<string>(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[]));
	const toggle = (agentId: string) => setFavorites((current) => {
		const next = new Set(current);
		if (next.has(agentId)) next.delete(agentId);
		else next.add(agentId);
		localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
		return next;
	});
	return [favorites, toggle];
}

/** A connection's glyph on the rail: the harness mark, or a network icon for a hub. */
function ConnectionGlyph({ connection, agents, className }: { connection: Connection; agents: AgentProfile[]; className?: string }) {
	if (connection.kind === "hub") return <Network className={cn("text-muted-foreground", className)} />;
	return <AgentMark agent={agents[0]} plain className={className} />;
}

type Tab = "favorites" | string;

interface Row {
	key: string;
	agent: AgentProfile | null;
	label: string;
	provider: string;
}

/**
 * Choose an agent, laid out as a rail of providers on the left (favourites
 * first), a search box, and the selected provider's models. Typing searches every provider. Arrow keys
 * move, Enter picks, Escape closes, Left goes to the rail.
 */
export function AgentPicker({ snapshot, value, onChange, trigger, allowNone, hideEffort, placeholder = "Assign an agent", noneLabel = "Unassign" }: { snapshot: FactorySnapshot; value?: string; onChange: (agentId: string | null) => void; trigger?: ReactElement; allowNone?: boolean; /** When an EffortPicker sits beside it. */ hideEffort?: boolean; placeholder?: string; noneLabel?: string }) {
	const [open, setOpen] = useState(false);
	const selected = snapshot.agents.find((agent) => agent.id === value);
	return <Popover open={open} onOpenChange={setOpen}>
		<PopoverTrigger render={trigger ?? <button type="button" className="relative inline-flex h-7 max-w-56 min-w-0 shrink cursor-pointer items-center justify-between gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap text-foreground/80 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent">
			<span className="flex min-w-0 flex-1 items-center gap-1.5">
				{selected && <AgentMark agent={selected} plain className="size-4" />}
				<span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>{selected ? `${selected.label}${selected.effort && !hideEffort ? ` · ${effortLabel(selected.effort)}` : ""}` : placeholder}</span>
			</span>
			<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
		</button>} />
		<PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0">
			{open && <PickerContent snapshot={snapshot} value={value} allowNone={allowNone} noneLabel={noneLabel} onPick={(agentId) => {
				onChange(agentId);
				setOpen(false);
			}} onClose={() => setOpen(false)} />}
		</PopoverContent>
	</Popover>;
}

function PickerContent({ snapshot, value, allowNone, noneLabel, onPick, onClose }: { snapshot: FactorySnapshot; value?: string; allowNone?: boolean; noneLabel: string; onPick: (agentId: string | null) => void; onClose: () => void }) {
	const [favorites, toggleFavorite] = useFavorites();
	const groups = useMemo(() => snapshot.connections.map((connection) => ({ connection, agents: snapshot.agents.filter((agent) => agent.connectionId === connection.id) })).filter((group) => group.agents.length > 0), [snapshot.connections, snapshot.agents]);
	const selected = snapshot.agents.find((agent) => agent.id === value);
	// Opens on favourites when there are any, otherwise on the selected agent's provider.
	const [tab, setTab] = useState<Tab>(() => (favorites.size ? "favorites" : selected?.connectionId ?? groups[0]?.connection.id ?? "favorites"));
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const search = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLDivElement>(null);
	const rail = useRef<HTMLDivElement>(null);
	const [indicator, setIndicator] = useState<number | null>(null);
	const providerName = (agent: AgentProfile) => groups.find((group) => group.connection.id === agent.connectionId)?.connection.label ?? harnessName(agent);

	const rows = useMemo((): Row[] => {
		const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
		const pool = words.length || tab === "favorites" ? snapshot.agents : snapshot.agents.filter((agent) => agent.connectionId === tab);
		const shown = pool
			.filter((agent) => (words.length ? words.every((word) => `${agent.label} ${agent.model} ${providerName(agent)} ${agent.description ?? ""}`.toLowerCase().includes(word)) : tab !== "favorites" || favorites.has(agent.id)))
			.map((agent): Row => ({ key: agent.id, agent, label: agent.label, provider: `${providerName(agent)}${agent.effort ? ` · ${effortLabel(agent.effort)}` : ""}` }));
		return allowNone && value && !words.length ? [...shown, { key: "none", agent: null, label: noneLabel, provider: "No agent" }] : shown;
	}, [query, tab, snapshot.agents, favorites, allowNone, value, noneLabel]);

	useEffect(() => {
		const index = rows.findIndex((row) => row.key === value);
		setActive(index >= 0 ? index : 0);
	}, [rows, value]);
	useEffect(() => search.current?.focus(), []);
	useEffect(() => {
		list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);
	useLayoutEffect(() => {
		const item = rail.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(tab)}"]`);
		setIndicator(item ? item.offsetTop + item.offsetHeight / 2 - 10 : null);
	}, [tab, groups]);

	const pick = (row: Row | undefined) => row && onPick(row.agent?.id ?? null);
	const tabs: Tab[] = ["favorites", ...groups.map((group) => group.connection.id)];
	const focusRail = () => rail.current?.querySelector<HTMLButtonElement>(`[data-tab="${CSS.escape(tab)}"] button`)?.focus();

	return <div className="relative flex max-h-[346px] w-screen max-w-[360px] flex-row overflow-hidden" data-model-picker-content>
		{/* Providers */}
		<div ref={rail} role="toolbar" aria-label="Providers" aria-orientation="vertical" className="w-11 shrink-0 overflow-y-auto bg-muted/30 [scrollbar-width:none]" onKeyDown={(event) => {
			const index = tabs.indexOf(tab);
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const next = tabs[(index + (event.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length]!;
				setTab(next);
				requestAnimationFrame(() => rail.current?.querySelector<HTMLButtonElement>(`[data-tab="${CSS.escape(next)}"] button`)?.focus());
			} else if (event.key === "ArrowRight" || event.key === "Enter") {
				event.preventDefault();
				search.current?.focus();
			} else if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		}}>
			<div className="relative flex min-h-full flex-col gap-1 p-1">
				{indicator !== null && <div aria-hidden className="pointer-events-none absolute right-0 z-10 h-5 w-[3px] rounded-l-[2px] bg-primary transition-[top] duration-200 ease-out" style={{ top: indicator }} />}
				<div data-tab="favorites" className="relative w-full">
					<Tip label="Favorites"><button type="button" aria-label="Favorites" aria-pressed={tab === "favorites"} onClick={() => { setTab("favorites"); setQuery(""); }} className="relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none">
						<Star className="size-5 shrink-0 fill-current" />
					</button></Tip>
				</div>
				<div className="border-b border-border/70" aria-hidden />
				{groups.map((group) => <div key={group.connection.id} data-tab={group.connection.id} className="relative w-full">
					<Tip label={group.connection.label}><button type="button" aria-label={group.connection.label} aria-pressed={tab === group.connection.id} onClick={() => { setTab(group.connection.id); setQuery(""); }} className="relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none">
						<ConnectionGlyph connection={group.connection} agents={group.agents} className="size-5" />
					</button></Tip>
				</div>)}
			</div>
		</div>

		{/* Search and models */}
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-border/70 bg-muted/40">
			<div className="min-w-0 shrink-0 px-3 pt-2.5">
				<div className="relative -translate-y-px border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
					<Search className="pointer-events-none absolute top-1.5 left-0 size-4 shrink-0 text-muted-foreground/55" />
					<input ref={search} value={query} placeholder="Search models..." aria-label="Search models" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
						if (event.key === "ArrowDown" || event.key === "ArrowUp") {
							event.preventDefault();
							if (rows.length) setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
						} else if (event.key === "Enter") {
							event.preventDefault();
							pick(rows[active]);
						} else if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							onClose();
						} else if ((event.key === "ArrowLeft" && !query) || (event.key === "Tab" && event.shiftKey)) {
							event.preventDefault();
							focusRail();
						}
					}} className="h-[26px] w-full bg-transparent ps-5 font-sans text-sm leading-[26px] outline-none placeholder:text-muted-foreground/70" />
				</div>
			</div>
			<div ref={list} role="listbox" aria-label="Models" className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain py-1.5 pr-px pl-2 [scrollbar-gutter:stable]">
				{rows.map((row, index) => {
					const isSelected = row.key === value;
					return <div key={row.key} role="option" aria-selected={isSelected} data-index={index} data-highlighted={index === active || undefined} data-selected={isSelected || undefined} title={row.agent?.description} onMouseMove={() => setActive(index)} onClick={() => pick(row)}
						className="group relative mb-0.5 flex min-h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm outline-none data-selected:bg-foreground/[0.08] data-highlighted:bg-accent data-highlighted:text-accent-foreground">
						<div className="min-w-0 flex-1 text-left">
							<div className="flex min-w-0 items-center gap-2">
								<div className={cn("min-w-0 truncate text-xs leading-snug font-medium", !row.agent && "text-muted-foreground")}>{row.label}</div>
							</div>
							<div className="mt-1 flex items-center gap-1.5">
								{row.agent && <AgentMark agent={row.agent} plain className="size-3" />}
								<span className="truncate text-xs leading-snug font-normal text-muted-foreground/70">{row.provider}</span>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							{row.agent && <Tip label={favorites.has(row.agent.id) ? "Remove from favorites" : "Add to favorites"}>
								<button type="button" aria-label={favorites.has(row.agent.id) ? "Remove from favorites" : "Add to favorites"} onClick={(event) => {
									event.stopPropagation();
									toggleFavorite(row.agent!.id);
								}} className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 hover:bg-foreground/10 hover:text-foreground">
									<Star className={cn("size-3", favorites.has(row.agent.id) && "fill-current text-warning")} />
								</button>
							</Tip>}
						</div>
					</div>;
				})}
				{!rows.length && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{tab === "favorites" && !query ? "No favorites yet. Star a model to keep it here." : groups.length ? "No models found" : "No agents connected. Open Settings, then Agents, to sign in to Claude Code or Codex."}</p>}
			</div>
		</div>
	</div>;
}
