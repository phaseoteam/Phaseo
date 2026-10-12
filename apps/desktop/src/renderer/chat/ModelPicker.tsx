import { useMemo, useState } from "react";
import { Check, ChevronDown, Columns3, LoaderCircle } from "lucide-react";
import type { Harness, ModelOption } from "../../shared/workspace";
import { usablePhaseoAccounts, useWorkspace } from "../app/workspace";
import type { ModelSelection } from "../lib/modelPreferences";
import { useModels } from "../lib/useModels";
import { useConnectedHarnesses } from "../lib/useConnectedHarnesses";
import { cn } from "../lib/utils";
import { ModelLogo } from "../components/ModelLogo";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../components/ui/command";
import { Switch } from "../components/ui/switch";

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

function ModelItem({ harness, accountId, model, selected, onToggle }: { harness: Harness; accountId?: string; model: ModelOption; selected: boolean; onToggle: (selection: ModelSelection) => void }) {
	return <CommandItem value={`${harness} ${model.name} ${model.organisationName ?? ""} ${model.id}`} onSelect={() => onToggle({ harness, accountId, model: model.id, reasoningEffort: model.defaultReasoningEffort, serviceTier: model.defaultServiceTier })}
		className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
		<span className="flex size-5 shrink-0 items-center justify-center [&_img]:size-4.5 [&_.harness-logo]:size-4.5"><ModelLogo model={model} harness={harness} /></span>
		<span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{model.name}</span>{model.description && <span className="block truncate text-[11px] text-muted-foreground">{model.description}</span>}</span>
		<Check className={cn("size-4 text-primary", !selected && "invisible")} />
	</CommandItem>;
}

function HarnessSection({ harness, accountId, selections, onToggle, grouped }: { harness: Harness; accountId?: string; selections: ModelSelection[]; onToggle: (selection: ModelSelection) => void; grouped?: boolean }) {
	const { models, loading, error } = useModels(harness, accountId);
	for (const model of models) knownModels.set(model.id, model);
	const isSelected = (model: ModelOption) => selections.some(value => sameSelection(value, { harness, accountId, model: model.id }));
	if (loading) return <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Loading {harnessNames[harness]} models…</div>;
	if (error) return <div className="px-3 py-2 text-xs text-destructive">{harnessNames[harness]}: {error}</div>;
	if (!grouped) return <CommandGroup heading={harnessNames[harness]}>{models.map(model => <ModelItem key={model.id} harness={harness} accountId={accountId} model={model} selected={isSelected(model)} onToggle={onToggle} />)}</CommandGroup>;
	const labs = new Map<string, ModelOption[]>();
	for (const model of models) { const lab = model.organisationName ?? "Other"; labs.set(lab, [...labs.get(lab) ?? [], model]); }
	return <>{[...labs].map(([lab, values]) => <CommandGroup key={lab} heading={lab}>{values.map(model => <ModelItem key={model.id} harness={harness} accountId={accountId} model={model} selected={isSelected(model)} onToggle={onToggle} />)}</CommandGroup>)}</>;
}

export function ModelPicker({ selections, onChange, compare, onCompareChange, allowCompare, agents, disabled, className }: {
	selections: ModelSelection[];
	onChange: (selections: ModelSelection[]) => void;
	compare?: boolean;
	onCompareChange?: (compare: boolean) => void;
	allowCompare?: boolean;
	/** Offer locally connected coding agents (Codex, Claude Code, …) besides Phaseo. */
	agents?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	const { overview } = useWorkspace();
	const [open, setOpen] = useState(false);
	const connected = useConnectedHarnesses();
	const phaseoAccount = usablePhaseoAccounts(overview)[0];
	const others = useMemo(() => [...connected].filter(harness => harness !== "phaseo" && harness !== "acp" && (agents || harness !== "grok")), [connected, agents]);
	const first = selections[0];
	const toggle = (selection: ModelSelection) => {
		if (!compare) { onChange([selection]); setOpen(false); return; }
		const exists = selections.some(value => sameSelection(value, selection));
		if (exists) { if (selections.length > 1) onChange(selections.filter(value => !sameSelection(value, selection))); return; }
		if (selections.length < MAX_COMPARE) onChange([...selections, selection]);
	};
	const label = (selection: ModelSelection) => knownModel(selection.model)?.name ?? (selection.model === "default" ? harnessNames[selection.harness] : modelLabel(selection.model));
	return <Popover open={open} onOpenChange={setOpen}>
		<PopoverTrigger disabled={disabled} render={<button type="button" aria-label="Choose model" className={cn("flex h-8 max-w-64 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition-colors hover:bg-muted disabled:opacity-50 data-popup-open:bg-muted", className)} />}>
			{compare && selections.length > 1
				? <><span className="flex -space-x-1">{selections.map(value => <span key={value.harness + value.model} className="flex size-5 items-center justify-center rounded-full bg-card ring-2 ring-card [&_img]:size-4 [&_.harness-logo]:size-4"><ModelLogo model={knownModel(value.model) ?? { id: value.model, name: value.model }} harness={value.harness} /></span>)}</span><span className="truncate">{selections.length} models</span></>
				: first ? <><span className="flex size-5 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4"><ModelLogo model={knownModel(first.model) ?? { id: first.model, name: first.model }} harness={first.harness} /></span><span className="truncate">{label(first)}</span></>
				: <span className="text-muted-foreground">Choose a model</span>}
			<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
		</PopoverTrigger>
		<PopoverContent align="start" side="top" sideOffset={8} className="w-96 gap-0 overflow-hidden rounded-xl p-0">
			<Command className="rounded-none bg-transparent">
				<CommandInput placeholder="Search models" wrapperClassName="p-2 pb-1" />
				<CommandList className="max-h-[22rem] p-1">
					<CommandEmpty>No models match.</CommandEmpty>
					{phaseoAccount && open && <HarnessSection harness="phaseo" accountId={phaseoAccount.id} selections={selections} onToggle={toggle} grouped />}
					{open && others.map(harness => <HarnessSection key={harness} harness={harness} selections={selections} onToggle={toggle} />)}
					{!phaseoAccount && !others.length && <p className="px-3 py-4 text-center text-xs text-muted-foreground">Sign in to Phaseo to choose from hundreds of models.</p>}
				</CommandList>
			</Command>
			{allowCompare && <label className="flex cursor-pointer items-center gap-2.5 border-t border-border px-3 py-2.5 text-xs">
				<Columns3 className="size-4 text-muted-foreground" />
				<span className="flex-1"><span className="block font-semibold">Compare models</span><span className="text-muted-foreground">{compare ? `Pick up to ${MAX_COMPARE} models to answer side by side` : "Send one message to several models"}</span></span>
				<Switch checked={!!compare} onCheckedChange={value => { onCompareChange?.(value); if (!value && selections.length > 1) onChange(selections.slice(0, 1)); }} />
			</label>}
		</PopoverContent>
	</Popover>;
}
