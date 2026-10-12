import type { ModelOption } from "../../shared/workspace";
import { Popover } from "@base-ui/react/popover";
import { Command } from "cmdk";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { ScrollArea } from "./ScrollArea";

export function ModelSelect({ models, value, onChange, loading, disabled, automatic, label = "Model" }: { models: ModelOption[]; value: string; onChange: (value: string) => void; loading: boolean; disabled?: boolean; automatic: boolean; label?: string }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const options = models.map(model => ({ value: model.id, label: model.name }));
	if (automatic && !options.some(option => option.value === "default")) options.unshift({ value: "default", label: "Automatic" });
	const currentKnown = options.some(option => option.value === value);
	const selected = options.find(option => option.value === value);
	const matches = options.filter(option => `${option.value} ${option.label}`.toLowerCase().includes(query.toLowerCase().trim()));
	return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) setQuery(""); }}>
		<Popover.Trigger value={value} aria-label={label} role="combobox" className="desktop-select-trigger" disabled={disabled || loading}><span className="model-selected-label">{selected?.label ?? (loading ? "Loading models…" : !value ? "Choose a model" : "Model unavailable")}</span><ChevronDown size={16} /></Popover.Trigger>
		<Popover.Portal><Popover.Positioner sideOffset={4} align="start" className="desktop-select-positioner"><Popover.Popup className="desktop-select-popup model-select-popup" aria-label={`${label} options`}>
			<Command shouldFilter={false} label="Available models"><Command.Input aria-label="Search models" placeholder="Search models…" value={query} onValueChange={setQuery} className="model-search" />
				<ScrollArea><Command.List>{matches.slice(0, 100).map(option => <Command.Item key={option.value} value={option.value} data-option-value={option.value} className="desktop-select-item" onSelect={() => { onChange(option.value); setOpen(false); }}><span>{option.label}</span>{option.value === value && <Check size={14} />}</Command.Item>)}{!matches.length && <Command.Empty>No matching models.</Command.Empty>}</Command.List></ScrollArea>
				{matches.length > 100 && <p className="model-search-hint">Showing 100 of {matches.length} models. Search to narrow the list.</p>}
				{value && !currentKnown && <p className="model-search-hint">The current model is unavailable.</p>}
			</Command>
		</Popover.Popup></Popover.Positioner></Popover.Portal>
	</Popover.Root>;
}
