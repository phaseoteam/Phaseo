import type { ReactNode } from "react";
import { Brain, SlidersHorizontal, Zap } from "lucide-react";
import type { ModelOptionDescriptor } from "../../shared/workspace";
import type { ModelSelection } from "../lib/modelPreferences";
import { rememberSettings } from "../lib/modelSettings";
import { useModels } from "../lib/useModels";
import { current, isFast, settingDescriptors, speedIds, withSetting } from "./ModelSettings";

/** Something `/` can do in this chat: run straight away, or open a short list of choices. */
/** `insert` puts text in the message box in place of the typed `/name` instead of running anything (`/side ` for a question to follow). */
export type ComposerAction = { id: string; label: string; description?: string; icon: ReactNode; hint?: string; checked?: boolean; run?: () => void | Promise<void>; insert?: string; options?: ComposerAction[] };

/** Window events the menu sends to controls that live elsewhere on screen. */
export const openModelPickerEvent = "phaseo:open-model-picker";
export const renameChatEvent = "phaseo:rename-chat";

const choices = (descriptor: ModelOptionDescriptor): { id: string; label: string; description?: string }[] => descriptor.type === "boolean"
	? [{ id: "true", label: "On" }, { id: "false", label: "Off" }]
	: descriptor.options.map(option => ({ id: option.id, label: option.label, description: option.description }));

/** The model's own settings as actions: Fast as a toggle, the rest (reasoning, context and so on) as lists. */
export function useModelSettingActions(selection: ModelSelection | undefined, onChange: (selection: ModelSelection) => void): ComposerAction[] {
	const { models } = useModels(selection?.harness ?? "phaseo", selection?.accountId, undefined, undefined, !!selection && selection.harness !== "acp");
	if (!selection) return [];
	const model = models.find(value => selection.model === "default" ? value.default : value.id === selection.model);
	const change = (descriptor: ModelOptionDescriptor, value: string | boolean) => { const next = withSetting(selection, descriptor, value); rememberSettings(next); onChange(next); };
	return settingDescriptors(selection.harness, model).map((descriptor): ComposerAction => {
		const value = current(selection, descriptor);
		if (speedIds.includes(descriptor.id)) {
			const fast = isFast(descriptor, value);
			const fastValue = descriptor.type === "boolean" ? true : descriptor.options.find(option => isFast(descriptor, option.id))?.id;
			const standard = descriptor.type === "boolean" ? false : descriptor.options.find(option => !isFast(descriptor, option.id) && option.id !== "flex")?.id;
			if (fastValue !== undefined && standard !== undefined) return { id: "fast", label: "Fast", icon: <Zap />, checked: fast, description: fast ? "Turn off Fast and return to standard speed" : "Turn on Fast for quicker replies, at the model's fast price", run: () => change(descriptor, fast ? standard : fastValue) };
		}
		const valueId = String(value);
		return { id: descriptor.id, label: descriptor.label, icon: /reason|effort|think/i.test(`${descriptor.id} ${descriptor.label}`) ? <Brain /> : <SlidersHorizontal />, hint: choices(descriptor).find(choice => choice.id === valueId)?.label,
			options: choices(descriptor).map(choice => ({ id: `${descriptor.id}:${choice.id}`, label: choice.label, description: choice.description, icon: null, checked: choice.id === valueId, run: () => change(descriptor, descriptor.type === "boolean" ? choice.id === "true" : choice.id) })) };
	});
}
