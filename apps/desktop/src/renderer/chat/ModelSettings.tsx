import { Fragment, useState, type ComponentProps, type KeyboardEvent } from "react";
import { useCommand } from "../lib/keybindings";
import { Check, ChevronDown, Zap } from "lucide-react";
import type { ModelOption, ModelOptionDescriptor } from "../../shared/workspace";
import type { ModelSelection } from "../lib/modelPreferences";
import { rememberSettings } from "../lib/modelSettings";
import { useModels } from "../lib/useModels";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { optionHarnesses } from "./startChat";
import { ModelPicker } from "./ModelPicker";

const effortLabels: Record<string, string> = { none: "None", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max", ultra: "Ultra" };
export const effortLabel = (id: string) => effortLabels[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

/** The settings a harness accepts for one model, in the shape the menu renders. Codex and Grok expose effort and speed as model fields; the rest describe their own options. */
export function settingDescriptors(harness: ModelSelection["harness"], model?: ModelOption): ModelOptionDescriptor[] {
	if (!model) return [];
	if (optionHarnesses.includes(harness)) return model.options ?? [];
	if (harness !== "codex" && harness !== "grok") return [];
	const result: ModelOptionDescriptor[] = [];
	if (model.reasoningEfforts?.length) result.push({ id: "reasoningEffort", label: "Reasoning", type: "select", options: model.reasoningEfforts.map(effort => ({ id: effort.id, label: effortLabel(effort.id), description: effort.description || undefined, ...(effort.id === model.defaultReasoningEffort ? { isDefault: true } : {}) })) });
	if (harness === "codex" && model.serviceTiers?.length) {
		const fallback = model.defaultServiceTier || "default";
		result.push({ id: "serviceTier", label: "Speed", type: "select", options: [
			{ id: "default", label: "Standard", ...(fallback === "default" ? { isDefault: true } : {}) },
			...model.serviceTiers.filter(tier => tier.id !== "default").map(tier => ({ id: tier.id, label: tier.name, description: tier.description || undefined, ...(tier.id === fallback ? { isDefault: true } : {}) })),
		] });
	}
	return result;
}

const stored = (selection: ModelSelection, id: string) => id === "reasoningEffort" ? selection.reasoningEffort || undefined : id === "serviceTier" ? selection.serviceTier || undefined : selection.options?.[id];
export const current = (selection: ModelSelection, descriptor: ModelOptionDescriptor) => {
	const value = stored(selection, descriptor.id);
	if (descriptor.type === "boolean") return typeof value === "boolean" ? value : descriptor.default ?? false;
	return typeof value === "string" && descriptor.options.some(option => option.id === value) ? value : descriptor.options.find(option => option.isDefault)?.id ?? descriptor.options[0]?.id;
};
export const speedIds = ["fastMode", "serviceTier", "speed"];
export const isFast = (descriptor: ModelOptionDescriptor, value: string | boolean | undefined) => (descriptor.id === "fastMode" && value === true) || (descriptor.id === "serviceTier" && typeof value === "string" && value !== "default") || (descriptor.id === "speed" && typeof value === "string" && !["standard", "flex"].includes(value));

/** Apply one setting to a selection; the default value is stored as unset so the harness keeps following it. */
export function withSetting(selection: ModelSelection, descriptor: ModelOptionDescriptor, value: string | boolean): ModelSelection {
	const isDefault = descriptor.type === "boolean" ? value === (descriptor.default ?? false) : descriptor.options.find(option => option.id === value)?.isDefault === true;
	if (descriptor.id === "reasoningEffort") return { ...selection, reasoningEffort: isDefault ? undefined : String(value) };
	if (descriptor.id === "serviceTier") return { ...selection, serviceTier: isDefault ? undefined : String(value) };
	const options = { ...selection.options };
	if (isDefault) delete options[descriptor.id]; else options[descriptor.id] = value;
	return { ...selection, options: Object.keys(options).length ? options : undefined };
}

/** The settings shown after the model's name: "High", "High · 1M context"; empty when they are all the model's usual. */
export function settingsLabel(selection: ModelSelection, descriptors: ModelOptionDescriptor[]) {
	return descriptors.filter(descriptor => !speedIds.includes(descriptor.id) || (descriptor.id === "speed" && current(selection, descriptor) === "flex")).map(descriptor => {
		const value = current(selection, descriptor);
		return descriptor.type === "boolean" ? `${descriptor.label} ${value ? "On" : "Off"}` : descriptor.options.find(option => option.id === value)?.label ?? "";
	}).filter(Boolean).join(" · ");
}

/** The selected model's own settings (reasoning, speed, context and the like), and how to show them. */
export function useModelSettings(selection: ModelSelection | undefined) {
	const usesCatalog = !!selection && selection.harness !== "acp";
	const { models } = useModels(selection?.harness ?? "phaseo", selection?.accountId, undefined, undefined, usesCatalog);
	if (!selection) return { descriptors: [], label: "", fast: false };
	const model = models.find(value => selection.model === "default" ? value.default : value.id === selection.model);
	const descriptors = settingDescriptors(selection.harness, model);
	return { descriptors, label: settingsLabel(selection, descriptors), fast: descriptors.some(descriptor => isFast(descriptor, current(selection, descriptor))) };
}

const choices = (descriptor: ModelOptionDescriptor): { id: string; label: string; description?: string; isDefault?: boolean }[] => descriptor.type === "boolean"
	? [{ id: "true", label: "On", isDefault: descriptor.default === true }, { id: "false", label: "Off", isDefault: descriptor.default !== true }]
	: descriptor.options;

const effortPattern = /reason|effort|think/i;
const isEffort = (descriptor: ModelOptionDescriptor) => effortPattern.test(`${descriptor.id} ${descriptor.label}`);
const columnRow = "flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] text-foreground outline-none hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07] disabled:cursor-not-allowed disabled:opacity-60";
const columnLabel = "px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground";

/**
 * The model picker's effort column: the selected model's reasoning levels first, then its other settings. Speed sits in
 * the picker's footer instead. The model's default level says Default; the chosen one has a check.
 */
export function EffortColumn({ selection, descriptors, modelName, onChange }: { selection: ModelSelection; descriptors: ModelOptionDescriptor[]; modelName: string; onChange: (selection: ModelSelection) => void }) {
	const change = (descriptor: ModelOptionDescriptor, value: string | boolean) => { const next = withSetting(selection, descriptor, value); rememberSettings(next); onChange(next); };
	const column = descriptors.filter(descriptor => !speedIds.includes(descriptor.id));
	const effort = column.find(isEffort);
	const ordered = effort ? [effort, ...column.filter(descriptor => descriptor !== effort)] : column;
	const moveBetweenRows = (event: KeyboardEvent<HTMLElement>) => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-effort-row]:not(:disabled)"));
		const next = rows[Math.min(rows.length - 1, Math.max(0, rows.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowDown" ? 1 : -1)))];
		if (!next) return;
		event.preventDefault(); event.stopPropagation(); next.focus(); next.scrollIntoView({ block: "nearest" });
	};
	return <>
		<div className="shrink-0 px-3 pt-2.5">
			<div className="flex h-8 items-center gap-2 border-b border-border/70 pb-1.5 text-[13px]">
				<span className="text-muted-foreground">{effort?.label ?? "Effort"}</span>
				<span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{modelName}</span>
			</div>
		</div>
		<div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 pt-2 pb-1.5" onKeyDown={moveBetweenRows}>
			{!ordered.length && <div className="flex h-8 items-center px-2 text-[13px] text-muted-foreground">No effort levels</div>}
			{ordered.map(descriptor => {
				const value = String(current(selection, descriptor));
				return <div key={descriptor.id} role="radiogroup" aria-label={descriptor.label} className="flex flex-col gap-0.5">
					{descriptor !== effort && <div className={columnLabel}>{descriptor.label}</div>}
					{choices(descriptor).map(option => {
						const checked = option.id === value;
						return <button key={option.id} type="button" role="radio" aria-checked={checked} data-effort-row tabIndex={checked ? 0 : -1} title={option.description}
							// "Default" is drawn after the label, so the row's text stays the level's name.
							data-default={option.isDefault && !checked ? "" : undefined}
							onClick={() => change(descriptor, descriptor.type === "boolean" ? option.id === "true" : option.id)}
							className={cn(columnRow, "data-default:after:ml-auto data-default:after:text-xs data-default:after:text-muted-foreground/70 data-default:after:content-['Default']")}>
							<span className="min-w-0 flex-1 truncate">{option.label}</span>
							{checked && <Check aria-hidden className="size-3.5 shrink-0" />}
						</button>;
					})}
				</div>;
			})}
		</div>
	</>;
}

/** Speed in the picker's footer: Standard or Fast (or the agent's own tiers), one click away. */
export function SpeedControl({ selection, descriptors, onChange }: { selection: ModelSelection; descriptors: ModelOptionDescriptor[]; onChange: (selection: ModelSelection) => void }) {
	const descriptor = descriptors.find(value => speedIds.includes(value.id));
	if (!descriptor) return null;
	const change = (value: string | boolean) => { const next = withSetting(selection, descriptor, value); rememberSettings(next); onChange(next); };
	const value = String(current(selection, descriptor));
	const options = descriptor.type === "boolean" ? [{ id: "false", label: "Standard" }, { id: "true", label: "Fast" }] : descriptor.options.map(option => ({ id: option.id, label: option.label, description: option.description }));
	return <div role="radiogroup" aria-label={descriptor.label} className="flex rounded-md bg-muted/70 p-0.5">
		{options.map(option => {
			const checked = option.id === value, fast = isFast(descriptor, descriptor.type === "boolean" ? option.id === "true" : option.id);
			return <button key={option.id} type="button" role="radio" aria-checked={checked} title={"description" in option ? option.description : undefined}
				onClick={() => change(descriptor.type === "boolean" ? option.id === "true" : option.id)}
				className={cn("flex h-6 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", checked && "bg-background text-foreground shadow-xs")}>
				{fast && <Zap aria-hidden className="size-3 fill-current" />}{option.label}
			</button>;
		})}
	</div>;
}

/**
 * The composer's model control: the model, then its effort and other settings after the name, all chosen in one
 * picker. With several models (comparing), the settings stay each model's own remembered ones.
 */
export function ModelControl({ selections, onChange, onSettings, openEvent, disabled, ...picker }: Omit<ComponentProps<typeof ModelPicker>, "settings"> & { onSettings: (selection: ModelSelection) => void; openEvent: string }) {
	const single = selections.length === 1 ? selections[0] : undefined;
	const { descriptors, label, fast } = useModelSettings(single);
	useCommand("modelSettings.toggle", () => { window.dispatchEvent(new Event(openEvent)); }, descriptors.length > 0 && !disabled);
	useCommand("modelPicker.toggle", () => { window.dispatchEvent(new Event(openEvent)); }, !disabled);
	return <ModelPicker {...picker} selections={selections} onChange={onChange} openEvent={openEvent} disabled={disabled}
		settings={single && descriptors.length ? {
			label, fast,
			column: descriptors.some(descriptor => !speedIds.includes(descriptor.id)) ? (modelName: string) => <EffortColumn selection={single} descriptors={descriptors} modelName={modelName} onChange={onSettings} /> : undefined,
			speed: <SpeedControl selection={single} descriptors={descriptors} onChange={onSettings} />,
		} : undefined} />;
}

/** A model's settings on their own, for places that choose the model separately (Settings → General). */
export function ModelSettings({ selection, onChange, disabled }: { selection: ModelSelection; onChange: (selection: ModelSelection) => void; disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	const { descriptors, label: named, fast } = useModelSettings(selection);
	if (!descriptors.length) return null;
	const label = named || (fast ? "Fast" : "Normal");
	const change = (descriptor: ModelOptionDescriptor, value: string | boolean) => { const next = withSetting(selection, descriptor, value); rememberSettings(next); onChange(next); };

	return <DropdownMenu open={open} onOpenChange={setOpen}>
		<DropdownMenuTrigger disabled={disabled} render={<button type="button" aria-label={`Model settings: ${label}${fast ? ", fast" : ""}`} title="Model settings"
			className="flex h-8 max-w-56 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 data-popup-open:bg-muted data-popup-open:text-foreground" />}>
			{fast && <Zap className={cn("size-3.5 shrink-0 fill-current", selection.harness === "claude" ? "text-[#d97757]" : "text-amber-500")} />}
			<span className="truncate">{label}</span>
			<ChevronDown className="size-3.5 shrink-0" />
		</DropdownMenuTrigger>
		<DropdownMenuContent align="start" side="top" sideOffset={8} className="w-64">
			{descriptors.map((descriptor, index) => <Fragment key={descriptor.id}>
				{index > 0 && <DropdownMenuSeparator />}
				<DropdownMenuGroup>
					<DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">{descriptor.label}</DropdownMenuLabel>
					<DropdownMenuRadioGroup value={String(current(selection, descriptor))} onValueChange={value => change(descriptor, descriptor.type === "boolean" ? value === "true" : String(value))}>
						{(descriptor.type === "boolean"
							? [{ id: "true", label: "On", isDefault: descriptor.default === true }, { id: "false", label: "Off", isDefault: descriptor.default !== true }] as { id: string; label: string; description?: string; isDefault?: boolean }[]
							: descriptor.options
						).map(option => <DropdownMenuRadioItem key={option.id} value={option.id} closeOnClick className="items-start">
							<span className="min-w-0">
								<span className="flex items-center gap-1.5">{option.label}{option.isDefault && <span className="rounded-sm border border-border px-1 text-[10px] leading-4 text-muted-foreground">Default</span>}</span>
								{option.description && <span className="mt-0.5 block max-w-52 text-xs text-muted-foreground/80">{option.description}</span>}
							</span>
						</DropdownMenuRadioItem>)}
					</DropdownMenuRadioGroup>
				</DropdownMenuGroup>
			</Fragment>)}
		</DropdownMenuContent>
	</DropdownMenu>;
}
