import { modelLabel, modelLabelText, type ModelLabel } from "@/features/chat/modelSheetRows";
import { effortLabel, type PhoneChatDetail, type PhoneModel, type PhoneResults } from "./protocol";

export type ModelList = PhoneResults["list_models"];
/** The model and effort picked for a new thread; a null effort is the model's default. */
export type ModelChoice = { model: string; effort: string | null };

/** What a new thread starts on before anything is picked: the computer's own choice. */
export const initialChoice = (list: ModelList): ModelChoice => ({ model: list.selected.model, effort: list.selected.reasoningEffort ?? null });

/**
 * What new_chat sends for a choice: only what differs from the computer's own choice, so an unchanged pick (or a
 * computer that couldn't list its models) leaves the computer to decide. The model's default effort is sent by name,
 * since the computer's choice may have set another.
 */
export function newThreadModel(list: ModelList | null, choice: ModelChoice | null): { model?: string; reasoningEffort?: string } {
  if (!list || !choice) return {};
  const model = list.models.find((entry) => entry.id === choice.model);
  if (!model) return {};
  const sameModel = choice.model === list.selected.model;
  const effort = choice.effort ?? (model.efforts?.length ? model.defaultEffort ?? null : null);
  const sameEffort = choice.effort === null ? sameModel && !list.selected.reasoningEffort : sameModel && effort === list.selected.reasoningEffort;
  return { ...(sameModel ? {} : { model: choice.model }), ...(effort && !sameEffort ? { reasoningEffort: effort } : {}) };
}

/** A computer model's name, from its list when the phone has one, else its id. */
export const modelName = (models: readonly PhoneModel[] | undefined, id: string) => models?.find((model) => model.id === id)?.name ?? id;

/** An existing thread's model and effort for its read-only control: "GPT-6.1 · High", or the model alone. */
export function threadModelLabel(chat: Pick<PhoneChatDetail, "model" | "reasoningEffort">, models?: readonly PhoneModel[]) {
  const parts = threadModel(chat, models);
  return parts ? modelLabelText(parts) : null;
}

/** The same, in parts, for the composer's control. */
export function threadModel(chat: Pick<PhoneChatDetail, "model" | "reasoningEffort">, models?: readonly PhoneModel[]): ModelLabel | null {
  if (!chat.model) return null;
  const model = models?.find((entry) => entry.id === chat.model);
  const effort = chat.reasoningEffort ? model?.efforts?.find((entry) => entry.id === chat.reasoningEffort)?.label ?? effortLabel(chat.reasoningEffort) : null;
  return modelLabel(model?.name ?? chat.model, effort);
}
