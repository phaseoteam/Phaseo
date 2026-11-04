import { formatDateParts } from "@phaseo/app-kit/format";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, CircleCheck, LoaderCircle, SearchIcon, Star } from "lucide-react";
import { runnableHarnesses, type Harness, type ModelOption } from "../../shared/workspace";
import { usablePhaseoAccounts, useWorkspace } from "../app/workspace";
import type { ModelSelection } from "../lib/modelPreferences";
import { useModels } from "../lib/useModels";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";
import { usePersistedState } from "../lib/persistedState";
import { rememberedSettings } from "../lib/modelSettings";
import { cn } from "../lib/utils";
import { ModelLogo } from "../components/ModelLogo";
import { HarnessLogo } from "../components/HarnessLogo";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { ScrollArea } from "../components/ui/scroll-area";
import { isCommandKey, useCommand } from "../lib/keybindings";
import { useModelPopularity } from "../lib/modelPopularity";
import { arrangeGroups, moveGroup, usePickerGroups } from "../lib/pickerGroups";
import { usePointerReorder } from "../lib/pointerReorder";
import { ModelSettingsColumn, SettingsSuffix, SpeedSegments, speedIds, useSettingDescriptors } from "./ModelSettings";

export const harnessNames: Record<Harness, string> = { phaseo: "Phaseo", codex: "Codex", claude: "Claude Code", opencode: "OpenCode", pi: "Pi", cursor: "Cursor", grok: "Grok", antigravity: "Antigravity", acp: "Agent" };
export const MAX_COMPARE = 4;

/** A name from a model id, for when no catalogue has named it yet: claude-opus-5-5 reads "Claude Opus 5.5". */
export function modelLabel(id: string) {
	const base = (id.includes("/") ? id.slice(id.indexOf("/") + 1) : id).replace(/-\d{8}$/, "").replace(/\b(\d{1,2})-(\d{1,2})\b/g, "$1.$2");
	return base.replace(/[-_]/g, " ").replace(/\b([a-z])/g, letter => letter.toUpperCase()).replace(/\bGpt\b/g, "GPT");
}

/** What a Latest alias runs now, without the words its name already says: "Claude Haiku Latest" now runs "5.5". */
export function latestHint(model: Pick<ModelOption, "name" | "latestOf">) {
	const target = knownModel(model.latestOf ?? "")?.name ?? model.latestOf ?? "", said = new Set(model.name.toLowerCase().split(/\s+/));
	return target.split(/\s+/).filter(word => !said.has(word.toLowerCase())).join(" ") || target;
}

/** The same model with the same settings. */
const sameChoice = (a: ModelSelection, b: ModelSelection) => sameSelection(a, b) && (a.reasoningEffort ?? "") === (b.reasoningEffort ?? "") && (a.serviceTier ?? "") === (b.serviceTier ?? "")
	&& JSON.stringify(Object.entries(a.options ?? {}).sort()) === JSON.stringify(Object.entries(b.options ?? {}).sort());
export const sameSelection = (a: ModelSelection, b: ModelSelection) => a.harness === b.harness && a.model === b.model && (a.accountId ?? "") === (b.accountId ?? "");

/** Model names are resolved from whichever catalog last listed them. */
const knownModels = new Map<string, ModelOption>();
export function knownModel(id: string) { return knownModels.get(id); }

export function modelName(selection: Pick<ModelSelection, "harness" | "model">) {
	return knownModel(selection.model)?.name ?? (selection.model === "default" ? harnessNames[selection.harness] : modelLabel(selection.model));
}

/**
 * The composer button's name. A local agent's model is already named by its logo, so it drops the family:
 * "Opus 5.5" beside the Claude Code mascot. A Phaseo model keeps its full name, "Claude Opus 5.5" beside the lab's logo.
 */
export function shortModelName(selection: Pick<ModelSelection, "harness" | "model">) {
	const name = modelName(selection);
	return selection.harness === "phaseo" ? name : name.replace(/^Claude (?=\S)/, "");
}

/** Where a chat's model runs, which also says what pays for it: "in Claude Code" is your plan, "via Phaseo" is credits. */
export const whereItRuns = (harness: Harness) => harness === "phaseo" ? "via Phaseo" : `in ${harnessNames[harness]}`;

/** Resolved when the tooltip opens, after the catalog has loaded. */
function ModelName({ value }: { value: Pick<ModelSelection, "harness" | "model"> }) { return modelName(value); }

/** Overlapping model logos; hovering one shows its model name. */
export function ModelStack({ models, size = "md", ringClassName = "bg-card ring-card" }: { models: Pick<ModelSelection, "harness" | "model">[]; size?: "sm" | "md"; ringClassName?: string }) {
	return <span className="flex -space-x-1">{models.map((value, index) => <Tooltip key={`${value.harness}:${value.model}:${index}`}>
		<TooltipTrigger delay={150} render={<span className={cn("relative flex items-center justify-center rounded-full hover:z-10", size === "sm" ? "size-4 ring-1 [&_img]:size-3.5 [&_.harness-logo]:size-3.5" : "size-5 ring-2 [&_img]:size-4 [&_.harness-logo]:size-4", ringClassName)} />}>
			<ModelLogo model={knownModel(value.model) ?? { id: value.model, name: value.model }} harness={value.harness} />
		</TooltipTrigger>
		<TooltipContent><ModelName value={value} /></TooltipContent>
	</Tooltip>)}</span>;
}

type Entry = { key: string; harness: Harness; accountId?: string; model: ModelOption };
/**
 * The picker's left column: favourites, then each local agent, then Phaseo's models, all of them
 * and then one lab at a time, so no list mixes where a model runs.
 */
type Group = "favourites" | "phaseo" | Harness | `lab:${string}`;
type GroupEntry = { id: Group; label: string; lab?: string };
const labOf = (entry: Entry) => entry.model.organisationId ?? (entry.model.id.includes("/") ? entry.model.id.split("/")[0] : "");
const inGroup = (entry: Entry, group: Group, favourites: Set<string>) => group === "favourites" ? favourites.has(entry.key)
	: group === "phaseo" ? entry.harness === "phaseo"
	: group.startsWith("lab:") ? entry.harness === "phaseo" && labOf(entry) === group.slice(4)
	: entry.harness === group;
const isPhaseoGroup = (group: Group) => group === "phaseo" || group.startsWith("lab:");
/**
 * Phaseo's labs for the left column: the most used first (their models' tokens this past week, as the website ranks
 * models), then those with the most models, then by name.
 */
export function phaseoLabGroups(models: Pick<ModelOption, "id" | "organisationId" | "organisationName">[], popularity?: ReadonlyMap<string, number>): GroupEntry[] {
	const labs = new Map<string, { label: string; count: number; tokens: number }>();
	for (const model of models) {
		const lab = labOf({ model } as Entry), current = labs.get(lab);
		if (lab) labs.set(lab, { label: model.organisationName ?? lab, count: (current?.count ?? 0) + 1, tokens: (current?.tokens ?? 0) + (popularity?.get(model.id) ?? 0) });
	}
	return [...labs].sort((a, b) => b[1].tokens - a[1].tokens || b[1].count - a[1].count || a[1].label.localeCompare(b[1].label)).map(([lab, value]) => ({ id: `lab:${lab}` as const, label: value.label, lab }));
}
const entryKey = (harness: Harness, id: string) => `${harness}:${id}`;
/** A picked model starts from the settings last chosen for it; unset settings follow the harness default. */
const selectionOf = (entry: Entry): ModelSelection => ({ harness: entry.harness, accountId: entry.accountId, model: entry.model.id, ...rememberedSettings(entry.harness, entry.model.id) });
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

type Section = { heading: string; entries: Entry[]; harness?: Harness; older?: number };
/** The list is flattened into rows and virtualised: the Phaseo catalog alone has hundreds of models. */
type Row = { type: "heading"; key: string; heading: string } | { type: "entry"; key: string; entry: Entry } | { type: "older"; key: string; harness: Harness; older: number };
const rowHeight = (row: Row) => row.type === "heading" ? 30 : 32;

export function ModelPicker({ selections, onChange, multiple, agents, disabled, className, openEvent, onSettingsChange, hidden }: {
	selections: ModelSelection[];
	onChange: (selections: ModelSelection[]) => void;
	/** Ctrl/⌘-click adds models alongside the first, to compare their answers. */
	multiple?: boolean;
	/** Code mode: also offer agents that only run as coding agents (Grok). Local subscriptions such as Codex and Claude Code show in both modes. */
	agents?: boolean;
	disabled?: boolean;
	className?: string;
	/** A window event that opens this picker, sent by the composer's / menu. */
	openEvent?: string;
	/** Shows one model's reasoning, speed and context window in the button and as a column in the picker. */
	onSettingsChange?: (selection: ModelSelection) => void;
	/** Agents the chat's project turns off. */
	hidden?: readonly Harness[];
}) {
	const { overview } = useWorkspace();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [group, setGroup] = useState<Group>("phaseo");
	const [showOlder, setShowOlder] = useState<Partial<Record<Harness, boolean>>>({});
	const [filters, setFilters] = usePersistedState("phaseo.desktop.modelFilters", { free: false, new: false });
	const [favourites, setFavourites] = usePersistedState<string[]>("phaseo.desktop.favouriteModels", []);
	const [catalogs, setCatalogs] = useState<Partial<Record<Harness, { entries: Entry[]; loading: boolean; error: string }>>>({});
	const keepOpen = useRef(false);
	const connected = useConnectedHarnesses();
	const phaseoAccount = usablePhaseoAccounts(overview)[0];
	const hiddenKey = hidden?.join() ?? "";
	const harnesses = useMemo(() => [...(phaseoAccount ? ["phaseo" as const] : []), ...[...connected].filter(harness => harness !== "phaseo" && harness !== "acp" && runnableHarnesses.includes(harness) && (agents || harness !== "grok"))].filter(harness => !hiddenKey.split(",").includes(harness)), [connected, agents, phaseoAccount, hiddenKey]);
	const onLoad = useCallback((harness: Harness, state: { entries: Entry[]; loading: boolean; error: string }) => setCatalogs(current => ({ ...current, [harness]: state })), []);

	const all = useMemo(() => harnesses.flatMap(harness => catalogs[harness]?.entries ?? []), [harnesses, catalogs]);
	const [groupPrefs, setGroupPrefs] = usePickerGroups();
	// A hidden agent or lab takes its models with it, from search too; hiding "All Phaseo models" leaves the labs.
	const hiddenGroups = useMemo(() => new Set(groupPrefs.hidden), [groupPrefs.hidden]);
	const visible = useMemo(() => all.filter(entry => !hiddenGroups.has(entry.harness === "phaseo" ? `lab:${labOf(entry)}` : entry.harness)).filter(entry => entry.harness !== "phaseo" || ((!filters.free || entry.model.id.endsWith(":free")) && (!filters.new || Date.now() - released(entry) <= twoWeeks))), [all, filters, hiddenGroups]);
	const favouriteSet = useMemo(() => new Set(favourites), [favourites]);
	const popularity = useModelPopularity(open && harnesses.includes("phaseo"));
	const groups = useMemo((): GroupEntry[] => {
		// Favourites lead; then the agents, then Phaseo, each block in the order chosen in Settings.
		return [
			{ id: "favourites", label: "Favourites" },
			...arrangeGroups(harnesses.filter(harness => harness !== "phaseo").map((harness): GroupEntry => ({ id: harness, label: harnessNames[harness] })), groupPrefs),
			...harnesses.includes("phaseo") ? arrangeGroups([{ id: "phaseo" as const, label: "All Phaseo models" }, ...phaseoLabGroups((catalogs.phaseo?.entries ?? []).map(entry => entry.model), popularity)], groupPrefs) : [],
		];
	}, [catalogs.phaseo?.entries, harnesses, popularity, groupPrefs]);
	const active: Group = groups.some(value => value.id === group) ? group : groups[1]?.id ?? "favourites";
	// Groups drag up and down the column within their block (agents, or Phaseo), as in Settings; favourites stay first.
	const blockOf = (id: string) => id === "favourites" ? "" : isPhaseoGroup(id as Group) ? "phaseo" : "agents";
	const column = useRef<HTMLDivElement>(null);
	const reorder = usePointerReorder({ list: column, threshold: 5, items: id => `[data-reorder-block="${blockOf(id)}"]`,
		onDrop: (id, to) => setGroupPrefs(moveGroup(groupPrefs, groups.filter(value => blockOf(value.id) === blockOf(id)).map(value => value.id), id, to)) });
	const isSelected = (entry: Entry) => selections.some(value => sameSelection(value, { harness: entry.harness, accountId: entry.accountId, model: entry.model.id }));

	const normalized = normalize(query);
	const ranked = useMemo(() => normalized
		? visible.map(entry => ({ entry, score: score(entry, normalized) })).filter(value => value.score > 0)
			.sort((a, b) => b.score - a.score || Number(!!a.entry.model.legacy) - Number(!!b.entry.model.legacy) || released(b.entry) - released(a.entry)).map(value => value.entry)
		: [], [normalized, visible]);

	const sections = useMemo((): Section[] => {
		// A search looks everywhere, whichever group is open.
		if (normalized) return [{ heading: ranked.length > 25 ? `Results (25 of ${ranked.length})` : `Results: ${ranked.length}`, entries: ranked.slice(0, 25) }];
		const here = visible.filter(entry => inGroup(entry, active, favouriteSet));
		const heading = groups.find(value => value.id === active)?.label ?? "";
		if (active === "favourites") return here.length ? [{ heading, entries: here }] : [];
		if (!isPhaseoGroup(active)) {
			const harness = active as Harness, pinned = here.filter(entry => !entry.model.latestOf), latest = here.filter(entry => entry.model.latestOf), older = pinned.filter(entry => entry.model.legacy).length;
			return [...latest.length ? [{ heading: "Latest", entries: latest }] : [], ...pinned.length ? [{ heading, harness, older, entries: showOlder[harness] ? pinned : pinned.filter(entry => !entry.model.legacy) }] : []];
		}
		const result: Section[] = [];
		// "Latest" aliases lead the group: each follows the newest model of its line.
		const latest = here.filter(entry => entry.model.latestOf);
		if (latest.length) result.push({ heading: "Latest", entries: latest });
		const months = new Map<string, Entry[]>();
		for (const entry of [...here].filter(entry => !entry.model.latestOf).sort((a, b) => released(b) - released(a))) {
			const time = released(entry);
			const heading = Number.isFinite(time) ? formatDateParts(time, { month: "long", year: "numeric", timeZone: "UTC" }) : "Other";
			months.set(heading, [...months.get(heading) ?? [], entry]);
		}
		for (const [heading, entries] of months) result.push({ heading, entries });
		return result;
	}, [normalized, ranked, visible, active, favouriteSet, groups, showOlder]);

	const rows = useMemo(() => sections.flatMap((section): Row[] => [
		{ type: "heading", key: `heading:${section.heading}`, heading: section.heading },
		...section.entries.map(entry => ({ type: "entry" as const, key: `${section.heading}:${entry.key}`, entry })),
		...section.harness && section.older ? [{ type: "older" as const, key: `older:${section.harness}`, harness: section.harness, older: section.older }] : [],
	]), [sections]);
	// Only rendered rows exist in the DOM, so each option states its place in the whole list.
	const positions = useMemo(() => { let position = 0; return rows.map(row => row.type === "heading" ? 0 : ++position); }, [rows]);
	const optionCount = positions.reduce((highest, value) => Math.max(highest, value), 0);
	const [activeKey, setActiveKey] = useState<string>();
	const activeIndex = useMemo(() => { const index = rows.findIndex(row => row.key === activeKey); return index >= 0 ? index : rows.findIndex(row => row.type !== "heading"); }, [rows, activeKey]);
	const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
	const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => viewport, estimateSize: index => rowHeight(rows[index]), overscan: 12 });
	// A new search or tab starts from the top; the viewport mounting must not reset keyboard progress.
	const scrollViewport = useRef(viewport); scrollViewport.current = viewport;
	useEffect(() => { setActiveKey(undefined); scrollViewport.current?.scrollTo({ top: 0 }); }, [normalized, active]);

	const toggleFavourite = (event: MouseEvent, entry: Entry) => {
		event.preventDefault(); event.stopPropagation();
		setFavourites(current => current.includes(entry.key) ? current.filter(value => value !== entry.key) : [...current, entry.key]);
	};
	const choose = (entry: Entry) => {
		const selection = selectionOf(entry);
		if (!multiple || !keepOpen.current) {
			onChange([selection]); setQuery("");
			// In a composer the picker stays open on the new model, so its settings can follow; Escape or a click
			// outside closes it. A picker with no settings (a default model in Settings) closes on the pick.
			if (onSettingsChange) setPending(selection);
			else setOpen(false);
			return;
		}
		keepOpen.current = false;
		if (isSelected(entry)) { if (selections.length > 1) onChange(selections.filter(value => !sameSelection(value, selection))); return; }
		if (selections.length < MAX_COMPARE) onChange([...selections, selection]);
	};
	const activate = (row: Row | undefined, compare: boolean) => {
		if (row?.type === "entry") { keepOpen.current = compare; choose(row.entry); }
		else if (row?.type === "older") setShowOlder(current => ({ ...current, [row.harness]: !current[row.harness] }));
	};
	const stepGroup = (direction: 1 | -1) => {
		const index = groups.findIndex(value => value.id === active), next = groups[(index + direction + groups.length) % groups.length];
		if (next) { setGroup(next.id); setQuery(""); }
	};
	// The same keys with focus elsewhere in the picker (its group column, a setting).
	useCommand("modelPicker.nextProvider", () => stepGroup(1), open);
	useCommand("modelPicker.previousProvider", () => stepGroup(-1), open);
	const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
		// Mod+Shift+Up and Down move between groups (as PageUp and PageDown do), before the arrows move through the list.
		const direction = isCommandKey(event.nativeEvent, ["modelPicker.nextProvider"]) ? 1 : isCommandKey(event.nativeEvent, ["modelPicker.previousProvider"]) ? -1 : 0;
		if (direction) { event.preventDefault(); stepGroup(direction); return; }
		if (event.nativeEvent.isComposing) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			for (let index = activeIndex + step; index >= 0 && index < rows.length; index += step) {
				if (rows[index].type === "heading") continue;
				setActiveKey(rows[index].key); virtualizer.scrollToIndex(index, { align: "auto" }); break;
			}
		} else if (event.key === "Enter") { event.preventDefault(); activate(rows[activeIndex], event.ctrlKey || event.metaKey); }
		else if (event.key === "PageDown" || event.key === "PageUp") { event.preventDefault(); stepGroup(event.key === "PageDown" ? 1 : -1); }
	};
	const shown = active === "favourites" ? harnesses : harnesses.filter(harness => isPhaseoGroup(active) ? harness === "phaseo" : harness === active);
	const toolbar = isPhaseoGroup(active) || !!multiple;
	const loading = shown.filter(harness => !catalogs[harness] || (catalogs[harness]!.loading && !catalogs[harness]!.entries.length));
	const errors = shown.map(harness => catalogs[harness]?.error ? `${harnessNames[harness]}: ${catalogs[harness]!.error}` : "").filter(Boolean);

	const [pending, setPending] = useState<ModelSelection>();
	const first = selections[0];
	// Until the chat reports the model and settings just chosen, the picker shows those, and the next change builds on them.
	useEffect(() => { if (pending && first && sameChoice(pending, first)) setPending(undefined); }, [pending, first]);
	// The picker opens where the chosen model lives: its agent, or its lab (read from the id until the catalogue names it).
	const firstLab = first?.harness === "phaseo" ? labOf({ model: knownModel(first.model) ?? { id: first.model, name: first.model } } as Entry) : "";
	const openChange = (value: boolean) => { setOpen(value); setQuery(""); setPending(undefined); if (value) setGroup(!first ? "phaseo" : first.harness !== "phaseo" ? first.harness : firstLab ? `lab:${firstLab}` : "phaseo"); };
	const latestOpen = useRef(openChange); latestOpen.current = openChange;
	// One model's reasoning, speed and context window sit in the same button and picker.
	const settingsSelection = onSettingsChange && selections.length === 1 ? pending ?? first : undefined;
	const descriptors = useSettingDescriptors(settingsSelection);
	// The button names the model from its own harness's catalog, so the name doesn't depend on whether the picker has shown that catalog yet.
	const { models: firstCatalog } = useModels(first?.harness ?? "phaseo", first?.accountId, undefined, undefined, !!first && first.harness !== "acp");
	const firstEntry = first && firstCatalog.find(value => first.model === "default" ? value.default : value.id === first.model);
	const firstName = !first ? "" : firstEntry ? (first.harness === "phaseo" ? firstEntry.name : firstEntry.name.replace(/^Claude (?=\S)/, "")) : shortModelName(first);
	useCommand("modelSettings.toggle", () => latestOpen.current(!open), descriptors.length > 0 && !disabled);
	// Mod+Shift+M opens the composer's picker; pickers elsewhere (Settings) have no open event and leave it alone.
	useCommand("modelPicker.toggle", () => latestOpen.current(!open), Boolean(openEvent) && !disabled);
	useEffect(() => {
		if (!openEvent || disabled) return;
		const show = () => latestOpen.current(true);
		window.addEventListener(openEvent, show);
		return () => window.removeEventListener(openEvent, show);
	}, [openEvent, disabled]);
	return <Popover open={open} onOpenChange={openChange}>
		{harnesses.filter(harness => open || harness === "phaseo" || selections.some(selection => selection.harness === harness)).map(harness => <Catalog key={harness} harness={harness} accountId={harness === "phaseo" ? phaseoAccount?.id : undefined} onLoad={onLoad} />)}
		<PopoverTrigger disabled={disabled} render={<button type="button" aria-label="Choose model" title={first && selections.length === 1 ? `${modelName(first)} ${whereItRuns(first.harness)}` : undefined} className={cn("flex h-8 max-w-80 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition-colors hover:bg-muted disabled:opacity-50 data-popup-open:bg-muted", className)} />}>
			{selections.length > 1
				? <><ModelStack models={selections} /><span className="truncate">{selections.length} models</span></>
				: first ? <><span className="flex size-5 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4"><ModelLogo model={knownModel(first.model) ?? { id: first.model, name: first.model }} harness={first.harness} /></span><span className="truncate">{firstName}</span>{settingsSelection && <SettingsSuffix selection={settingsSelection} descriptors={descriptors} />}</>
				: <span className="text-muted-foreground">Choose a model</span>}
			<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
		</PopoverTrigger>
		{/* Stays above or below the button and shrinks to fit below the title bar, rather than sliding sideways over the composer. */}
			<PopoverContent align="end" side="top" sideOffset={8} collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }} collisionPadding={{ top: 52, right: 8, bottom: 8, left: 8 }} className={cn("max-h-(--available-height) gap-0 overflow-hidden rounded-xl p-0", descriptors.length ? "w-[min(94vw,552px)]" : "w-[min(92vw,360px)]")}>
				<div className="flex h-[min(346px,calc(var(--available-height)-48px))] min-h-0 min-w-0">
				<div ref={column} role="toolbar" aria-orientation="vertical" aria-label="Model groups"
					// Pressing a group can start a drag; listened for here, as the tooltip wrapping each button keeps its own handlers.
					onPointerDown={event => { const id = (event.target as HTMLElement).closest<HTMLElement>("[data-reorder-block]")?.dataset.reorderId; if (id) reorder.start(event, id); }}
					// The logos are images the browser would drag itself, cancelling ours.
					onDragStart={event => event.preventDefault()} className="flex w-11 shrink-0 flex-col gap-1 overflow-y-auto overscroll-contain bg-muted/30 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{groups.map((value, index) => <Fragment key={value.id}>
						{/* A rule after favourites, and another where Phaseo's models begin. */}
						{index > 0 && (groups[index - 1].id === "favourites" || (isPhaseoGroup(value.id) && !isPhaseoGroup(groups[index - 1].id))) && <div aria-hidden className="mx-1 border-b border-border/70" />}
						<Tooltip>
							<TooltipTrigger delay={200} render={<button type="button" aria-label={value.label} aria-pressed={active === value.id} data-reorder-block={blockOf(value.id) || undefined} data-reorder-id={value.id}
								onClick={() => { if (reorder.consumeDrag()) return; setGroup(value.id); setQuery(""); }}
								className={cn("relative flex aspect-square w-full shrink-0 touch-none items-center justify-center rounded-md transition-colors hover:bg-foreground/10 [&_img]:size-5 [&_.harness-logo]:size-5", active === value.id && "bg-foreground/10", reorder.drag?.id === value.id && "opacity-50")} />}>
								{value.id === "favourites" ? <Star className="size-5 fill-current" />
									: value.lab ? <ModelLogo model={{ id: `${value.lab}/model`, name: value.label, organisationId: value.lab }} harness="phaseo" />
									: <HarnessLogo harness={value.id === "phaseo" ? "phaseo" : value.id as Harness} />}
								{active === value.id && <span aria-hidden className="absolute top-1/2 -right-1 h-5 w-0.75 -translate-y-1/2 rounded-full bg-primary" />}
								{reorder.drag && blockOf(value.id) === blockOf(reorder.drag.id) && (() => {
									const block = groups.filter(entry => blockOf(entry.id) === blockOf(value.id)), place = block.findIndex(entry => entry.id === value.id);
									return place === reorder.drag.over ? <span aria-hidden className="absolute inset-x-0.5 -top-[3.5px] z-10 h-[3px] rounded-full bg-primary" />
										: place === block.length - 1 && reorder.drag.over === block.length ? <span aria-hidden className="absolute inset-x-0.5 -bottom-[3.5px] z-10 h-[3px] rounded-full bg-primary" /> : null;
								})()}
							</TooltipTrigger>
							<TooltipContent side="left">{value.label}</TooltipContent>
						</Tooltip>
					</Fragment>)}
				</div>
				<div className="flex min-w-0 flex-1 flex-col">
				<div className={cn("p-2", toolbar ? "pb-1" : "border-b border-border/70")}>
				<div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-input/50 px-2.5">
					<SearchIcon className="size-4 shrink-0 opacity-50" />
					<input autoFocus role="combobox" aria-expanded aria-controls="model-picker-list" aria-autocomplete="list" aria-activedescendant={rows[activeIndex] ? `model-row-${activeIndex}` : undefined}
						aria-label="Search models" placeholder="Search models" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onSearchKey}
						className="w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground" />
				</div>
			</div>
			{toolbar && <div className="flex h-10 items-center gap-1.5 border-b border-border/70 px-3 pb-1">
				{isPhaseoGroup(active) && <>
					<FilterButton active={filters.free} onClick={() => setFilters(current => ({ ...current, free: !current.free }))}>Free</FilterButton>
					<FilterButton active={filters.new} onClick={() => setFilters(current => ({ ...current, new: !current.new }))}>New</FilterButton>
				</>}
				{multiple && <span className="ml-auto text-[11px] text-muted-foreground">{isMac() ? "⌘" : "Ctrl"}-click to compare up to {MAX_COMPARE}</span>}
			</div>}
			{rows.length > 0 && <ScrollArea className="min-h-0 flex-1" viewportRef={setViewport} viewportClassName="py-1.5 pr-3.5 pl-1.5">
				<div id="model-picker-list" role="listbox" aria-label="Models" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
					{virtualizer.getVirtualItems().map(item => {
						const row = rows[item.index], highlighted = item.index === activeIndex;
						const place = { position: "absolute", top: 0, left: 0, width: "100%", height: item.size, transform: `translateY(${item.start}px)` } as const;
						if (row.type === "heading") return <div key={row.key} role="presentation" style={place} className="flex items-end px-2 pb-1.5 text-xs font-bold text-foreground/70">{row.heading}</div>;
						const common = { id: `model-row-${item.index}`, role: "option", "aria-selected": highlighted, "aria-setsize": optionCount, "aria-posinset": positions[item.index], style: place, onMouseMove: () => { if (!highlighted) setActiveKey(row.key); } } as const;
						if (row.type === "older") return <div key={row.key} {...common} onClick={() => activate(row, false)}
							className={cn("flex cursor-default items-center gap-2 rounded-md px-2 text-xs text-muted-foreground", highlighted && "bg-muted text-foreground")}>
							<ChevronDown className={cn("size-3.5 transition-transform", showOlder[row.harness] && "rotate-180")} />
							{showOlder[row.harness] ? "Hide older models" : `Show ${row.older} older ${row.older === 1 ? "model" : "models"}`}
						</div>;
						const { entry } = row, selected = isSelected(entry), starred = favouriteSet.has(entry.key);
						const variant = entry.model.id.includes(":") ? entry.model.id.split(":").at(-1) : undefined;
						return <div key={row.key} {...common} onMouseDown={event => { keepOpen.current = event.ctrlKey || event.metaKey; }} onClick={() => choose(entry)}
							className={cn("group/model flex cursor-default items-center gap-2 rounded-md px-2", selected && "bg-foreground/5", highlighted && "bg-muted")}>
							<span className="flex size-4 shrink-0 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4"><ModelLogo model={entry.model} harness={entry.harness} /></span>
							<span className="min-w-0 truncate text-[13px] font-medium">{entry.model.name.split(":")[0]}</span>
							{entry.model.latestOf && <span className="min-w-0 shrink truncate text-xs text-muted-foreground/70" title={`Now ${knownModel(entry.model.latestOf)?.name ?? entry.model.latestOf}`}>{latestHint(entry.model)}</span>}
							{variant && <span className="shrink-0 rounded-sm bg-success/15 px-1.5 text-[10px] font-semibold text-success">{variant === "free" ? "Free" : variant}</span>}
							{entry.harness !== "phaseo" && (normalized || starred) && <span className="shrink-0 text-[11px] text-muted-foreground">{harnessNames[entry.harness]}</span>}
							{selected && <CircleCheck className="size-4 shrink-0 text-foreground/70" />}
							<button type="button" aria-label={starred ? `Remove ${entry.model.name} from favourites` : `Add ${entry.model.name} to favourites`} title={starred ? "Remove from favourites" : "Add to favourites"}
								onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }} onClick={event => toggleFavourite(event, entry)}
								className={cn("ml-auto grid size-6 shrink-0 place-items-center rounded-md transition-colors", starred ? "text-amber-500 hover:bg-amber-500/10" : "text-muted-foreground opacity-0 group-hover/model:opacity-100 hover:bg-muted hover:text-foreground", !starred && highlighted && "opacity-100")}>
								<Star className="size-4" fill={starred ? "currentColor" : "none"} />
							</button>
						</div>;
					})}
				</div>
			</ScrollArea>}
			{!rows.length && !loading.length && <p className="py-6 text-center text-sm text-muted-foreground">{!harnesses.length ? "Sign in to Phaseo to choose from hundreds of models."
								: active === "favourites" && !normalized ? "Star a model to keep it here." : "No models found."}</p>}
			{loading.map(harness => <div key={harness} className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Loading {harnessNames[harness]} models…</div>)}
			{errors.map(error => <p key={error} className="px-3 py-2 text-xs text-destructive">{error}</p>)}
				</div>
				{settingsSelection && descriptors.length > 0 && <ScrollArea className="w-48 shrink-0 border-l border-border/70 bg-muted/40" viewportClassName="px-2 pt-3 pb-1.5">
					<ModelSettingsColumn selection={settingsSelection} descriptors={descriptors} onChange={next => { setPending(next); onSettingsChange?.(next); }} />
				</ScrollArea>}
				</div>
				{settingsSelection && descriptors.some(descriptor => speedIds.includes(descriptor.id)) && <div className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-muted/40 px-3 py-2">
					<SpeedSegments selection={settingsSelection} descriptors={descriptors} onChange={next => { setPending(next); onSettingsChange?.(next); }} />
				</div>}
	</PopoverContent>
	</Popover>;
}
