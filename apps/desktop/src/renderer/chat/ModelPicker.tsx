import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronDown, CircleCheck, LoaderCircle, Star } from "lucide-react";
import type { Harness, ModelOption } from "../../shared/workspace";
import { usablePhaseoAccounts, useWorkspace } from "../app/workspace";
import type { ModelSelection } from "../lib/modelPreferences";
import { useModels } from "../lib/useModels";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { ModelLogo } from "../components/ModelLogo";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../components/ui/command";

export const harnessNames: Record<Harness, string> = { phaseo: "Phaseo", codex: "Codex", claude: "Claude Code", opencode: "OpenCode", pi: "Pi", cursor: "Cursor", grok: "Grok", antigravity: "Antigravity", acp: "Agent" };
export const MAX_COMPARE = 4;

export function modelLabel(id: string) {
	const base = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
	return base.replace(/[-_]/g, " ").replace(/\b([a-z])/g, letter => letter.toUpperCase()).replace(/\bGpt\b/g, "GPT");
}

export const sameSelection = (a: ModelSelection, b: ModelSelection) => a.harness === b.harness && a.model === b.model && (a.accountId ?? "") === (b.accountId ?? "");

/** Model names are resolved from whichever catalog last listed them. */
const knownModels = new Map<string, ModelOption>();
export function knownModel(id: string) { return knownModels.get(id); }

type Entry = { key: string; harness: Harness; accountId?: string; model: ModelOption };
const entryKey = (harness: Harness, id: string) => `${harness}:${id}`;
const selectionOf = (entry: Entry): ModelSelection => ({ harness: entry.harness, accountId: entry.accountId, model: entry.model.id, reasoningEffort: entry.model.defaultReasoningEffort, serviceTier: entry.model.defaultServiceTier });
const isMac = () => window.phaseoDesktop?.platform === "darwin";
const twoWeeks = 14 * 86_400_000;

/** Loads one harness catalog and reports it to the picker. */
function Catalog({ harness, accountId, onLoad }: { harness: Harness; accountId?: string; onLoad: (harness: Harness, state: { entries: Entry[]; loading: boolean; error: string }) => void }) {
	const { models, loading, error } = useModels(harness, accountId);
	useEffect(() => {
		for (const model of models) knownModels.set(model.id, model);
		onLoad(harness, { entries: models.map(model => ({ key: entryKey(harness, model.id), harness, accountId, model })), loading, error });
	}, [harness, accountId, models, loading, error, onLoad]);
	return null;
}

const normalize = (value: string) => value.toLowerCase().replace(/[\s._-]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();

/** Same ranking as the web chat picker: exact, then prefix, then substring matches on id, name and lab. */
function score(entry: Entry, query: string) {
	const id = normalize(entry.model.id), name = normalize(entry.model.name), lab = normalize(entry.model.organisationName ?? ""), harness = normalize(harnessNames[entry.harness]);
	const terms = query.split(" ").filter(Boolean);
	const haystack = `${id} ${name} ${lab} ${harness}`;
	if (!terms.every(term => haystack.includes(term))) return 0;
	let value = 0;
	if (id === query) value += 2200;
	if (name === query) value += 2000;
	if (id.startsWith(query)) value += 1400;
	if (name.startsWith(query)) value += 1300;
	if (lab.startsWith(query) || harness.startsWith(query)) value += 920;
	if (id.includes(query)) value += 760;
	if (name.includes(query)) value += 700;
	if (lab.includes(query)) value += 520;
	for (const term of terms) {
		if (id.startsWith(term)) value += 220;
		if (name.startsWith(term)) value += 190;
		if (id.includes(term)) value += 130;
		if (name.includes(term)) value += 120;
		if (lab.includes(term)) value += 100;
	}
	return value;
}

const released = (entry: Entry) => { const time = Date.parse(entry.model.releaseDate ?? ""); return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY; };

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
	return <button type="button" aria-pressed={active} onClick={onClick}
		className={cn("h-7 rounded-md border px-2.5 text-xs font-medium transition-colors", active ? "border-primary bg-primary text-primary-foreground hover:bg-primary/85" : "border-border text-foreground hover:bg-muted")}>{children}</button>;
}

export function ModelPicker({ selections, onChange, multiple, agents, disabled, className }: {
	selections: ModelSelection[];
	onChange: (selections: ModelSelection[]) => void;
	/** Ctrl/⌘-click adds models alongside the first, to compare their answers. */
	multiple?: boolean;
	/** Offer locally connected coding agents (Codex, Claude Code, …) besides Phaseo. */
	agents?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	const { overview } = useWorkspace();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [filters, setFilters] = usePersistedState("phaseo.desktop.modelFilters", { free: false, new: false });
	const [favourites, setFavourites] = usePersistedState<string[]>("phaseo.desktop.favouriteModels", []);
	const [catalogs, setCatalogs] = useState<Partial<Record<Harness, { entries: Entry[]; loading: boolean; error: string }>>>({});
	const keepOpen = useRef(false);
	const connected = useConnectedHarnesses();
	const phaseoAccount = usablePhaseoAccounts(overview)[0];
	const harnesses = useMemo(() => [...(phaseoAccount ? ["phaseo" as const] : []), ...[...connected].filter(harness => harness !== "phaseo" && harness !== "acp" && agents)], [connected, agents, phaseoAccount]);
	const onLoad = useCallback((harness: Harness, state: { entries: Entry[]; loading: boolean; error: string }) => setCatalogs(current => ({ ...current, [harness]: state })), []);

	const all = useMemo(() => harnesses.flatMap(harness => catalogs[harness]?.entries ?? []), [harnesses, catalogs]);
	const visible = useMemo(() => all.filter(entry => (!filters.free || entry.model.id.endsWith(":free")) && (!filters.new || Date.now() - released(entry) <= twoWeeks)), [all, filters]);
	const favouriteSet = useMemo(() => new Set(favourites), [favourites]);
	const isSelected = (entry: Entry) => selections.some(value => sameSelection(value, { harness: entry.harness, accountId: entry.accountId, model: entry.model.id }));

	const sections = useMemo(() => {
		const normalized = normalize(query);
		if (normalized) {
			const ranked = visible.map(entry => ({ entry, score: score(entry, normalized) })).filter(value => value.score > 0).sort((a, b) => b.score - a.score || released(b.entry) - released(a.entry));
			return [{ heading: ranked.length > 25 ? `Results (25 of ${ranked.length})` : `Results: ${ranked.length}`, entries: ranked.slice(0, 25).map(value => value.entry) }];
		}
		const result: { heading: string; entries: Entry[] }[] = [];
		const starred = visible.filter(entry => favouriteSet.has(entry.key));
		if (starred.length) result.push({ heading: "Favourites", entries: starred });
		const rest = visible.filter(entry => !favouriteSet.has(entry.key));
		for (const harness of harnesses.filter(value => value !== "phaseo")) {
			const entries = rest.filter(entry => entry.harness === harness);
			if (entries.length) result.push({ heading: harnessNames[harness], entries });
		}
		const months = new Map<string, Entry[]>();
		for (const entry of rest.filter(value => value.harness === "phaseo").sort((a, b) => released(b) - released(a))) {
			const time = released(entry);
			const heading = Number.isFinite(time) ? new Date(time).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) : "Other";
			months.set(heading, [...months.get(heading) ?? [], entry]);
		}
		for (const [heading, entries] of months) result.push({ heading, entries });
		return result;
	}, [query, visible, favouriteSet, harnesses]);

	const toggleFavourite = (event: MouseEvent, entry: Entry) => {
		event.preventDefault(); event.stopPropagation();
		setFavourites(current => current.includes(entry.key) ? current.filter(value => value !== entry.key) : [...current, entry.key]);
	};
	const choose = (entry: Entry) => {
		const selection = selectionOf(entry);
		if (!multiple || !keepOpen.current) { onChange([selection]); setOpen(false); setQuery(""); return; }
		keepOpen.current = false;
		if (isSelected(entry)) { if (selections.length > 1) onChange(selections.filter(value => !sameSelection(value, selection))); return; }
		if (selections.length < MAX_COMPARE) onChange([...selections, selection]);
	};
	const loading = harnesses.filter(harness => !catalogs[harness] || (catalogs[harness]!.loading && !catalogs[harness]!.entries.length));
	const errors = harnesses.map(harness => catalogs[harness]?.error ? `${harnessNames[harness]}: ${catalogs[harness]!.error}` : "").filter(Boolean);

	const label = (selection: ModelSelection) => knownModel(selection.model)?.name ?? (selection.model === "default" ? harnessNames[selection.harness] : modelLabel(selection.model));
	const first = selections[0];
	return <Popover open={open} onOpenChange={value => { setOpen(value); if (!value) setQuery(""); }}>
		{harnesses.filter(harness => open || harness === "phaseo").map(harness => <Catalog key={harness} harness={harness} accountId={harness === "phaseo" ? phaseoAccount?.id : undefined} onLoad={onLoad} />)}
		<PopoverTrigger disabled={disabled} render={<button type="button" aria-label="Choose model" className={cn("flex h-8 max-w-64 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition-colors hover:bg-muted disabled:opacity-50 data-popup-open:bg-muted", className)} />}>
			{selections.length > 1
				? <><span className="flex -space-x-1">{selections.map(value => <span key={value.harness + value.model} className="flex size-5 items-center justify-center rounded-full bg-card ring-2 ring-card [&_img]:size-4 [&_.harness-logo]:size-4"><ModelLogo model={knownModel(value.model) ?? { id: value.model, name: value.model }} harness={value.harness} /></span>)}</span><span className="truncate">{selections.length} models</span></>
				: first ? <><span className="flex size-5 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4"><ModelLogo model={knownModel(first.model) ?? { id: first.model, name: first.model }} harness={first.harness} /></span><span className="truncate">{label(first)}</span></>
				: <span className="text-muted-foreground">Choose a model</span>}
			<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
		</PopoverTrigger>
		<PopoverContent align="end" side="top" sideOffset={8} className="w-[min(92vw,520px)] gap-0 overflow-hidden rounded-xl p-0">
			<Command shouldFilter={false} className="rounded-none bg-transparent">
				<CommandInput autoFocus placeholder="Search models" value={query} onValueChange={setQuery} wrapperClassName="p-2 pb-1" />
				<div className="flex items-center gap-1 border-b border-border px-3 pt-1 pb-2">
					<FilterButton active={filters.free} onClick={() => setFilters(current => ({ ...current, free: !current.free }))}>Free</FilterButton>
					<FilterButton active={filters.new} onClick={() => setFilters(current => ({ ...current, new: !current.new }))}>New</FilterButton>
					{multiple && <span className="ml-auto text-[11px] text-muted-foreground">{isMac() ? "⌘" : "Ctrl"}-click to compare up to {MAX_COMPARE}</span>}
				</div>
				<CommandList className="max-h-[min(60vh,440px)] p-1.5">
					{!loading.length && <CommandEmpty>{harnesses.length ? "No models found." : "Sign in to Phaseo to choose from hundreds of models."}</CommandEmpty>}
					{sections.map(section => <CommandGroup key={section.heading} heading={section.heading} className="**:[[cmdk-group-heading]]:font-bold **:[[cmdk-group-heading]]:text-foreground/70">
						{section.entries.map(entry => {
							const selected = isSelected(entry);
							const starred = favouriteSet.has(entry.key);
							const variant = entry.model.id.includes(":") ? entry.model.id.split(":").at(-1) : undefined;
							return <CommandItem key={section.heading + entry.key} value={section.heading + entry.key} onSelect={() => choose(entry)}
								onMouseDown={event => { keepOpen.current = event.ctrlKey || event.metaKey; }}
								className={cn("group/model flex min-h-8 items-center gap-2 rounded-md px-2 py-1 [&>svg:last-child]:hidden", selected && "bg-foreground/5")}>
								<span className="flex size-4 shrink-0 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4"><ModelLogo model={entry.model} harness={entry.harness} /></span>
								<span className="min-w-0 truncate text-[13px] font-medium">{entry.harness === "phaseo" && entry.model.organisationName ? `${entry.model.organisationName}: ` : ""}{entry.model.name.split(":")[0]}</span>
								{variant && <span className="shrink-0 rounded-sm bg-success/15 px-1.5 text-[10px] font-semibold text-success">{variant === "free" ? "Free" : variant}</span>}
								{selected && <CircleCheck className="size-4 shrink-0 text-foreground/70" />}
								<button type="button" aria-label={starred ? `Remove ${entry.model.name} from favourites` : `Add ${entry.model.name} to favourites`} title={starred ? "Remove from favourites" : "Add to favourites"}
									onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }} onClick={event => toggleFavourite(event, entry)}
									className={cn("ml-auto grid size-6 shrink-0 place-items-center rounded-md transition-colors", starred ? "text-amber-500 hover:bg-amber-500/10" : "text-muted-foreground opacity-0 group-hover/model:opacity-100 group-data-[selected=true]/model:opacity-100 hover:bg-muted hover:text-foreground")}>
									<Star className="size-4" fill={starred ? "currentColor" : "none"} />
								</button>
							</CommandItem>;
						})}
					</CommandGroup>)}
					{loading.map(harness => <div key={harness} className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Loading {harnessNames[harness]} models…</div>)}
					{errors.map(error => <p key={error} className="px-3 py-2 text-xs text-destructive">{error}</p>)}
				</CommandList>
			</Command>
		</PopoverContent>
	</Popover>;
}
