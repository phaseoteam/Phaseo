import type { SessionConfigOption, SessionModeState } from "@agentclientprotocol/sdk";
import type { ModelOption } from "../shared/workspace";

function selectChoices(options: SessionConfigOption[] | null | undefined, category: string): ModelOption[] {
	const option = options?.find(value => value.category === category && value.type === "select");
	if (!option || option.type !== "select") return [];
	const values = option.options.flatMap(value => "options" in value ? value.options : [value]);
	if (values.length > 1000) throw new Error("The ACP model catalog exceeds its limit.");
	const seen = new Set<string>();
	return values.filter(value => { if (!value.value || value.value.length > 1000 || seen.has(value.value)) return false; seen.add(value.value); return true; }).map(value => ({ id: value.value, name: value.name.slice(0, 1000), ...(value.description ? { description: value.description.slice(0, 2000) } : {}), default: value.value === option.currentValue }));
}
export function acpModels(options: SessionConfigOption[] | null | undefined) { return selectChoices(options, "model"); }
export function acpModes(modes: SessionModeState | null | undefined, options: SessionConfigOption[] | null | undefined): ModelOption[] {
	if (!modes) return selectChoices(options, "mode");
	if (modes.availableModes.length > 1000) throw new Error("The ACP mode catalog exceeds its limit.");
	const seen = new Set<string>();
	return modes.availableModes.filter(value => { if (!value.id || value.id.length > 1000 || seen.has(value.id)) return false; seen.add(value.id); return true; }).map(value => ({ id: value.id, name: value.name.slice(0, 1000), ...(value.description ? { description: value.description.slice(0, 2000) } : {}), default: value.id === modes.currentModeId }));
}
