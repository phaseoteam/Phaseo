import { Popover } from "@base-ui/react/popover";
import { Command } from "cmdk";
import { Check, ChevronDown, Star } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { Harness, ModelOption } from "../../shared/workspace";
import { HarnessLogo } from "./HarnessLogo";
import { ModelLogo } from "./ModelLogo";
import { PhaseoModelFilters } from "./PhaseoModelFilters";
import { emptyModelFilters, filterModels } from "./modelFilters";
import { ScrollArea } from "./ScrollArea";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";

const optionLabel = (value: string) => value.toLowerCase() === "default" ? "Standard" : value === "xhigh" ? "Extra High" : value.replace(/(^|[ _-])(\w)/g, (_match, separator, letter) => `${separator === "_" || separator === "-" ? " " : separator}${letter.toUpperCase()}`);

const harnessOptions = [["codex", "Codex"], ["claude", "Claude Code"], ["opencode", "OpenCode 2"], ["pi", "Pi"], ["cursor", "Cursor"], ["grok", "Grok"], ["phaseo", "Phaseo"], ["acp", "ACP agent"]] as const;

export function SessionPicker({ harness, model, models, loading, disabled, reasoningEffort, serviceTier, onHarnessChange, onModelChange, onReasoningChange, onSpeedChange, connection, feedback, switchingSession = false }: {
	harness: Harness; model: string; models: ModelOption[]; loading: boolean; disabled?: boolean;
	reasoningEffort: string; serviceTier: string;
	onHarnessChange: (value: Harness) => void; onModelChange: (value: string) => void;
	onReasoningChange: (value: string) => void; onSpeedChange: (value: string) => void;
	connection?: ReactNode; feedback?: ReactNode; switchingSession?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const connected = useConnectedHarnesses();
	const [query, setQuery] = useState("");
	const search = useRef<HTMLInputElement>(null);
	const [filters, setFilters] = useState(emptyModelFilters);
	const [favorites, setFavorites] = useState<string[]>(() => {
		try { const saved: unknown = JSON.parse(localStorage.getItem("phaseo-desktop-favorite-models") ?? "[]"); return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
	});
	const toggleFavorite = (id: string) => {
		const next = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
		setFavorites(next);
		try { localStorage.setItem("phaseo-desktop-favorite-models", JSON.stringify(next)); } catch { /* Favorites remain usable when storage is unavailable. */ }
	};
	const selected = models.find(value => model === "default" ? value.default : value.id === model);
	const options = models;
	const matches = filterModels(options, query, harness === "phaseo" ? filters : emptyModelFilters, favorites);
	const name = selected?.name ?? (!model || model === "default" ? "Select model" : "Model unavailable");
	return <Popover.Root open={open} onOpenChange={value => { setOpen(value); if (value) setQuery(""); }}>
		<Popover.Trigger type="button" className="session-picker-trigger" aria-label="Model and runtime" disabled={disabled}>{selected && <HarnessLogo harness={harness} />}<span>{name}</span>{selected && reasoningEffort && <small>{optionLabel(reasoningEffort)}</small>}{selected && serviceTier && <small>{optionLabel(selected?.serviceTiers?.find(value => value.id === serviceTier)?.name ?? serviceTier)}</small>}<ChevronDown size={12} /></Popover.Trigger>
		<Popover.Portal><Popover.Positioner sideOffset={8} align="start" className="desktop-select-positioner"><Popover.Popup initialFocus={search} className="session-picker-popup" aria-label="Model and runtime options">
			<div className="session-picker-body"><ScrollArea className="session-harnesses"><nav aria-label="Runtimes">{harnessOptions.filter(([value]) => connected.has(value)).map(([value, label]) => <button type="button" key={value} disabled={disabled} aria-pressed={harness === value} onClick={() => { if (value !== harness) { onHarnessChange(value); setQuery(""); if (switchingSession) setOpen(false); } }}><HarnessLogo harness={value} /><span>{label}</span></button>)}</nav></ScrollArea>
				<div className="session-models">{connection && <div className="session-connection">{connection}</div>}{harness === "phaseo" && <PhaseoModelFilters models={models} filters={filters} onChange={setFilters} count={matches.length} />}<Command shouldFilter={false} label="Available models"><Command.Input ref={search} aria-label="Search models" placeholder="Search models…" value={query} onValueChange={setQuery} className="model-search" /><ScrollArea className="session-model-list"><Command.List aria-busy={loading}>{!loading && matches.slice(0, 100).map(value => <div className="session-model-row" key={value.id}><Command.Item value={value.id} data-option-value={value.id} className="desktop-select-item" disabled={disabled} onSelect={() => onModelChange(value.id)}><span className="session-model-name"><ModelLogo model={value} harness={harness === "phaseo" ? undefined : harness} /><span>{value.name}</span></span>{value.id === selected?.id && <Check size={14} />}</Command.Item>{harness === "phaseo" && <button type="button" className="model-favorite" aria-label={`${favorites.includes(value.id) ? "Unfavorite" : "Favorite"} ${value.name}`} aria-pressed={favorites.includes(value.id)} onClick={() => toggleFavorite(value.id)}><Star size={14} fill={favorites.includes(value.id) ? "currentColor" : "none"} /></button>}</div>)}{loading ? <p className="model-search-hint" role="status">Loading models…</p> : !matches.length ? <Command.Empty>{models.length ? "No models match your filters." : "No available models."}</Command.Empty> : null}</Command.List></ScrollArea>{matches.length > 100 && <p className="model-search-hint">Search to narrow {matches.length} models.</p>}</Command>{feedback}</div>
			</div>
			{selected && ((["codex", "grok", "acp"].includes(harness) && !!selected.reasoningEfforts?.length) || (harness === "codex" && !!selected.serviceTiers?.length)) && <div className="session-tuning">
				{["codex", "grok", "acp"].includes(harness) && !!selected.reasoningEfforts?.length && <div><span>Reasoning</span><div className="session-choice-group" aria-label="Reasoning effort">{selected.reasoningEfforts.map(value => <button type="button" key={value.id} title={value.description} aria-pressed={(reasoningEffort || selected.defaultReasoningEffort) === value.id} disabled={loading || disabled} onClick={() => onReasoningChange(value.id)}>{optionLabel(value.id)}</button>)}</div></div>}
				{harness === "codex" && !!selected.serviceTiers?.length && <div><span>Speed</span><div className="session-choice-group" aria-label="Speed">{selected.serviceTiers.map(value => <button type="button" key={value.id} title={value.description} aria-pressed={(serviceTier || selected.defaultServiceTier) === value.id} disabled={loading || disabled} onClick={() => onSpeedChange(value.id)}>{optionLabel(value.name === "Default" || value.name === "default" ? "Standard" : value.name)}</button>)}</div></div>}
			</div>}
			{switchingSession && <p className="model-search-hint">Changing runtime continues this conversation in a new chat.</p>}
		</Popover.Popup></Popover.Positioner></Popover.Portal>
	</Popover.Root>;
}
