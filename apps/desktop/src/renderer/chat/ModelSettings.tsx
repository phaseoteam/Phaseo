import { Fragment, useEffect, useState } from "react";
import { ChevronDown, Zap } from "lucide-react";
import type { ModelOption, ModelOptionDescriptor } from "../../shared/workspace";
import type { ModelSelection } from "../lib/modelPreferences";
import { rememberSettings } from "../lib/modelSettings";
import { useModels } from "../lib/useModels";
import { cn } from "../lib/utils";
import { shortcutLabel } from "../lib/shortcuts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { optionHarnesses } from "./startChat";

const effortLabels: Record<string, string> = { none: "None", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max", ultra: "Ultra" };
const effortLabel = (id: string) => effortLabels[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

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
const current = (selection: ModelSelection, descriptor: ModelOptionDescriptor) => {
	const value = stored(selection, descriptor.id);
	if (descriptor.type === "boolean") return typeof value === "boolean" ? value : descriptor.default ?? false;
	return typeof value === "string" && descriptor.options.some(option => option.id === value) ? value : descriptor.options.find(option => option.isDefault)?.id ?? descriptor.options[0]?.id;
};
const isFast = (descriptor: ModelOptionDescriptor, value: string | boolean | undefined) => (descriptor.id === "fastMode" && value === true) || (descriptor.id === "serviceTier" && typeof value === "string" && value !== "default");

/** Apply one setting to a selection; the default value is stored as unset so the harness keeps following it. */
function withSetting(selection: ModelSelection, descriptor: ModelOptionDescriptor, value: string | boolean): ModelSelection {
	const isDefault = descriptor.type === "boolean" ? value === (descriptor.default ?? false) : descriptor.options.find(option => option.id === value)?.isDefault === true;
	if (descriptor.id === "reasoningEffort") return { ...selection, reasoningEffort: isDefault ? undefined : String(value) };
	if (descriptor.id === "serviceTier") return { ...selection, serviceTier: isDefault ? undefined : String(value) };
	const options = { ...selection.options };
	if (isDefault) delete options[descriptor.id]; else options[descriptor.id] = value;
	return { ...selection, options: Object.keys(options).length ? options : undefined };
}

/** Composer control for a model's reasoning, speed, context window and similar settings, like T3 Code's traits picker. */
export function ModelSettings({ selection, onChange, disabled }: { selection: ModelSelection; onChange: (selection: ModelSelection) => void; disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	const usesCatalog = selection.harness !== "phaseo" && selection.harness !== "acp";
	const { models } = useModels(selection.harness, selection.accountId, undefined, undefined, usesCatalog);
	const model = models.find(value => selection.model === "default" ? value.default : value.id === selection.model);
	const descriptors = settingDescriptors(selection.harness, model);
	useEffect(() => {
		if (!descriptors.length || disabled) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || event.key.toLowerCase() !== "e") return;
			event.preventDefault(); setOpen(value => !value);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [descriptors.length, disabled]);
	if (!descriptors.length) return null;

	const values = descriptors.map(descriptor => ({ descriptor, value: current(selection, descriptor) }));
	const fast = values.some(({ descriptor, value }) => isFast(descriptor, value));
	const parts = values.filter(({ descriptor }) => descriptor.id !== "fastMode" && descriptor.id !== "serviceTier").map(({ descriptor, value }) => descriptor.type === "boolean" ? `${descriptor.label} ${value ? "On" : "Off"}` : descriptor.options.find(option => option.id === value)?.label ?? "");
	const label = parts.filter(Boolean).join(" · ") || (fast ? "Fast" : "Normal");
	const change = (descriptor: ModelOptionDescriptor, value: string | boolean) => { const next = withSetting(selection, descriptor, value); rememberSettings(next); onChange(next); };

	return <DropdownMenu open={open} onOpenChange={setOpen}>
		<DropdownMenuTrigger disabled={disabled} render={<button type="button" aria-label={`Model settings: ${label}${fast ? ", fast" : ""}`} title={`Model settings (${shortcutLabel("Shift+E")})`}
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
