import { Check } from "lucide-react";
import { cn } from "../lib/utils";
import type { ModelOption, ModelOptionDescriptor } from "../../shared/workspace";
import type { ModelSelection } from "../lib/modelPreferences";
import { rememberSettings } from "../lib/modelSettings";
import { useModels } from "../lib/useModels";
import { optionHarnesses } from "./startChat";

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

/** The composer button's words, such as "High · Ultrafast". Speed is a word, shown only when it isn't the standard speed. */
export function settingsLabel(selection: ModelSelection, descriptors: ModelOptionDescriptor[]) {
	const parts = descriptors.map(descriptor => {
		const value = current(selection, descriptor);
		if (descriptor.type === "boolean") return speedIds.includes(descriptor.id) ? (value === true ? "Fast" : "") : `${descriptor.label} ${value ? "On" : "Off"}`;
		const label = descriptor.options.find(option => option.id === value)?.label ?? "";
		return !speedIds.includes(descriptor.id) || isFast(descriptor, value) || value === "flex" ? label : "";
	});
	return parts.filter(Boolean).join(" · ") || "Normal";
}


export type SpeedTier = "fast" | "ultrafast";
/** Which fast speed a value is, for its glyph; Flex and the standard speed have none. */
export function speedTier(descriptor: ModelOptionDescriptor, value: string | boolean | undefined): SpeedTier | undefined {
	if (!speedIds.includes(descriptor.id) || !isFast(descriptor, value)) return undefined;
	const label = descriptor.type === "select" ? descriptor.options.find(option => option.id === value)?.label ?? "" : "";
	return /ultra/i.test(`${String(value)} ${label}`) ? "ultrafast" : "fast";
}

const isReasoning = (descriptor: ModelOptionDescriptor) => /reason|effort|think/i.test(`${descriptor.id} ${descriptor.label}`);

/** What the model button shows after the name: the reasoning level, a speed glyph and the context window. */
export function settingsSummary(selection: ModelSelection, descriptors: ModelOptionDescriptor[]) {
	let effort: string | undefined, speed: SpeedTier | undefined, flex = false, context: string | undefined;
	for (const descriptor of descriptors) {
		const value = current(selection, descriptor);
		const label = descriptor.type === "select" ? descriptor.options.find(option => option.id === value)?.label : `${descriptor.label} ${value ? "On" : "Off"}`;
		if (speedIds.includes(descriptor.id)) { speed ??= speedTier(descriptor, value); flex ||= value === "flex"; }
		else if (!effort && isReasoning(descriptor)) effort = label;
		else if (/context/i.test(descriptor.id)) context = label;
	}
	return { effort, speed, flex, context };
}

/**
 * Phaseo's speed marks: forward chevrons, two for Fast and three for Ultrafast, drawn on whole pixels so they
 * stay sharp at 1x. Colour follows the text.
 */
export function SpeedGlyph({ tier, className }: { tier: SpeedTier; className?: string }) {
	const count = tier === "ultrafast" ? 3 : 2, width = 4 * count + 3;
	return <svg aria-hidden width={width} height={10} viewBox={`0 0 ${width} 10`} className={cn("shrink-0", className)} data-speed={tier}>
		{Array.from({ length: count }, (_, index) => <path key={index} d={`M${1 + index * 4} 1.5 L${4.5 + index * 4} 5 L${1 + index * 4} 8.5`} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />)}
	</svg>;
}

/** The model button's tail: "High", the speed glyph, "1M". */
export function SettingsSuffix({ selection, descriptors }: { selection: ModelSelection; descriptors: ModelOptionDescriptor[] }) {
	const { effort, speed, flex, context } = settingsSummary(selection, descriptors);
	if (!effort && !speed && !flex && !context) return null;
	return <span className="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground">
		{effort && <span className="max-w-24 truncate">{effort}</span>}
		{speed && <SpeedGlyph tier={speed} />}
		{flex && <span>Flex</span>}
		{context && <span className="text-xs">{context}</span>}
	</span>;
}

/**
 * The picker's settings column: the model's reasoning levels first, then speed, context window and any other options,
 * one group each. A pick applies at once and leaves the picker open, so several can change together.
 */
export function ModelSettingsColumn({ selection, descriptors, onChange }: { selection: ModelSelection; descriptors: ModelOptionDescriptor[]; onChange: (selection: ModelSelection) => void }) {
	const ordered = [...descriptors.filter(isReasoning), ...descriptors.filter(descriptor => !isReasoning(descriptor))];
	const change = (descriptor: ModelOptionDescriptor, value: string | boolean) => { const next = withSetting(selection, descriptor, value); rememberSettings(next); onChange(next); };
	return <div className="flex flex-col gap-2 py-1.5">
		{ordered.map(descriptor => {
			const value = current(selection, descriptor);
			const options = descriptor.type === "boolean"
				? [{ id: "true", label: "On" }, { id: "false", label: "Off" }] as { id: string; label: string; description?: string }[]
				: descriptor.options;
			return <div key={descriptor.id} role="radiogroup" aria-label={descriptor.label}>
				<p className="px-2 pt-1 pb-1 text-xs font-semibold text-muted-foreground">{descriptor.label}</p>
				{options.map(option => {
					const selected = String(value) === option.id, tier = speedTier(descriptor, descriptor.type === "boolean" ? option.id === "true" : option.id);
					return <button key={option.id} type="button" role="radio" aria-checked={selected} title={option.description}
						onClick={() => change(descriptor, descriptor.type === "boolean" ? option.id === "true" : option.id)}
						className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-muted", selected && "font-medium")}>
						<span className="min-w-0 flex-1 truncate">{option.label}</span>
						{tier && <SpeedGlyph tier={tier} className="text-muted-foreground" />}
						{selected && <Check className="size-3.5 shrink-0" />}
					</button>;
				})}
			</div>;
		})}
	</div>;
}

/** The settings a model has, for the picker and the composer; empty while the model's list loads. */
export function useSettingDescriptors(selection: ModelSelection | undefined) {
	const { models } = useModels(selection?.harness ?? "phaseo", selection?.accountId, undefined, undefined, !!selection && selection.harness !== "acp");
	if (!selection) return [];
	return settingDescriptors(selection.harness, models.find(value => selection.model === "default" ? value.default : value.id === selection.model));
}
