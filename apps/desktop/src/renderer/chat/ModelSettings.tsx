import { Fragment, useState, type ComponentProps } from "react";
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

/** The model's settings inside the model picker, one row each, so the model and its effort are chosen in one place. */
export function ModelSettingsPanel({ selection, descriptors, onChange }: { selection: ModelSelection; descriptors: ModelOptionDescriptor[]; onChange: (selection: ModelSelection) => void }) {
	const change = (descriptor: ModelOptionDescriptor, value: string | boolean) => { const next = withSetting(selection, descriptor, value); rememberSettings(next); onChange(next); };
	return <div aria-label="Model settings" role="group" className="flex flex-col gap-1 border-t border-border px-3 py-2">
		{descriptors.map(descriptor => {
			const value = String(current(selection, descriptor));
			return <div key={descriptor.id} role="radiogroup" aria-label={descriptor.label} className="flex min-h-8 items-center gap-2">
				<span className="w-20 shrink-0 truncate text-xs font-medium text-muted-foreground">{descriptor.label}</span>
				<div className="flex min-w-0 flex-wrap gap-0.5">
					{choices(descriptor).map(option => {
						const checked = option.id === value;
						return <button key={option.id} type="button" role="radio" aria-checked={checked} title={[option.description, option.isDefault ? "The model's default" : ""].filter(Boolean).join(" · ") || undefined}
							onClick={() => change(descriptor, descriptor.type === "boolean" ? option.id === "true" : option.id)}
							className={cn("flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors", checked ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
							{checked && <Check className="size-3" />}{option.label}
						</button>;
					})}
				</div>
			</div>;
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
	return <ModelPicker {...picker} selections={selections} onChange={onChange} openEvent={openEvent} disabled={disabled}
		settings={single && descriptors.length ? { label, fast, panel: <ModelSettingsPanel selection={single} descriptors={descriptors} onChange={onSettings} /> } : undefined} />;
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
