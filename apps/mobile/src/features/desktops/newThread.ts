import { modelLabel, modelLabelText, type ModelLabel, type SheetRow } from "@/features/chat/modelSheetRows";
import { formatMonth } from "@/lib/format";
import { effortLabel, type PhoneAgent, type PhoneChatDetail, type PhoneModel, type PhonePermissionMode, type PhoneResults } from "./protocol";

export type ModelList = PhoneResults["list_models"];
/** The agent, model and effort picked for a new thread; a null effort is the model's default. */
export type ModelChoice = { harness: string; accountId?: string; model: string; effort: string | null };

/**
 * The agents a new thread can run on. A computer from before agents lists only the models of the agent it would use;
 * they show as one agent with no harness, and new_chat then names only the model.
 */
export const listAgents = (list: ModelList): PhoneAgent[] => list.agents ?? [{ harness: "", name: "On this computer", source: "local", models: list.models }];

const sameAgent = (agent: Pick<PhoneAgent, "harness" | "accountId">, choice: Pick<ModelChoice, "harness" | "accountId">) => agent.harness === choice.harness && (agent.accountId ?? "") === (choice.accountId ?? "");
export const agentOf = (list: ModelList, choice: ModelChoice) => listAgents(list).find((agent) => sameAgent(agent, choice));
export const modelOf = (list: ModelList, choice: ModelChoice) => agentOf(list, choice)?.models.find((model) => model.id === choice.model);

/** What a new thread starts on before anything is picked: the computer's own choice. */
export const initialChoice = (list: ModelList): ModelChoice => ({
  harness: list.selected.harness ?? "", ...(list.selected.accountId ? { accountId: list.selected.accountId } : {}),
  model: list.selected.model, effort: list.selected.reasoningEffort ?? null,
});

/** A pick kept while it's still in a new list (another mode's), else the list's own choice. */
export const choiceIn = (list: ModelList, picked: ModelChoice | null) => (picked && modelOf(list, picked) ? picked : initialChoice(list));

/**
 * What new_chat sends for a choice. To a computer that lists agents, the agent, the model and the effort it runs at
 * (the model's default by name, since the computer's own choice may have set another). To an older computer, only
 * what differs from its own choice, so an unchanged pick leaves it to decide. Nothing for a model it didn't list.
 */
export function newThreadModel(list: ModelList | null, choice: ModelChoice | null): { harness?: string; accountId?: string; model?: string; reasoningEffort?: string } {
  if (!list || !choice) return {};
  const agent = agentOf(list, choice);
  const model = modelOf(list, choice);
  if (!agent || !model) return {};
  const effort = choice.effort ?? (model.efforts?.length ? model.defaultEffort ?? null : null);
  const offered = effort && model.efforts?.some((entry) => entry.id === effort) ? effort : null;
  if (list.agents) return { harness: agent.harness, ...(agent.accountId ? { accountId: agent.accountId } : {}), model: model.id, ...(offered ? { reasoningEffort: offered } : {}) };
  const sameModel = choice.model === list.selected.model;
  const sameEffort = choice.effort === null ? sameModel && !list.selected.reasoningEffort : sameModel && effort === list.selected.reasoningEffort;
  return { ...(sameModel ? {} : { model: choice.model }), ...(effort && !sameEffort ? { reasoningEffort: effort } : {}) };
}

/** Where a model sits in the sheet: Phaseo's catalogue, or the coding agents on the computer. */
export type SheetTab = "phaseo" | "local";
export type SheetItem = { key: string; agent: PhoneAgent; model: PhoneModel };
/** A sheet row: a heading, a model, an agent's "N older" toggle, or a note that an agent's models couldn't be read. */
export type ThreadSheetRow = SheetRow<SheetItem>;

export const sheetTabs = (list: ModelList): SheetTab[] => (["phaseo", "local"] as const).filter((tab) => listAgents(list).some((agent) => agent.source === tab));
export const tabOf = (list: ModelList, choice: ModelChoice): SheetTab => agentOf(list, choice)?.source ?? sheetTabs(list)[0] ?? "local";

const item = (agent: PhoneAgent, model: PhoneModel): SheetItem => ({ key: `${agent.harness}:${agent.accountId ?? ""}:${model.id}`, agent, model });
const released = (entry: SheetItem) => { const time = Date.parse(entry.model.releaseDate ?? ""); return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY; };

/**
 * The sheet's rows for one tab, as the window's picker lays them out. Both start with the window's favourites. Phaseo
 * then lists its models by release month, newest first; the computer's agents each get a heading with their current
 * models and an "N older" row that shows the legacy ones, and an agent that couldn't be read says why. A search lists
 * the matches across the tab's agents, legacy models included.
 */
export function threadSheetRows({ list, tab, query = "", olderOpen = [] }: { list: ModelList; tab: SheetTab; query?: string; olderOpen?: readonly string[] }): ThreadSheetRow[] {
  const agents = listAgents(list).filter((agent) => agent.source === tab);
  const all = agents.flatMap((agent) => agent.models.map((model) => item(agent, model)));
  const search = query.trim().toLocaleLowerCase();
  const rows: ThreadSheetRow[] = [];
  const section = (key: string, title: string, items: SheetItem[]) => {
    if (!items.length) return;
    rows.push({ type: "heading", key: `h:${key}`, title });
    for (const entry of items) rows.push({ type: "model", key: `${key}:${entry.key}`, item: entry, section: key });
  };
  if (search) {
    section("results", "Results", all.filter((entry) => `${entry.model.name} ${entry.model.id} ${entry.agent.name}`.toLocaleLowerCase().includes(search)));
    return rows;
  }
  const favourites = new Set(list.favourites ?? []);
  section("favourites", "Favourites", all.filter((entry) => favourites.has(`${entry.agent.harness}:${entry.model.id}`)));
  if (tab === "phaseo") {
    const months = new Map<string, SheetItem[]>();
    for (const entry of all.filter((value) => !value.model.legacy).sort((a, b) => released(b) - released(a))) {
      const month = Number.isFinite(released(entry)) ? formatMonth(entry.model.releaseDate!) : "Other";
      months.set(month, [...(months.get(month) ?? []), entry]);
    }
    for (const [month, items] of months) section(`month:${month}`, month, items);
    return rows;
  }
  for (const agent of agents) {
    if (agent.error) { rows.push({ type: "note", key: `note:${agent.harness}`, text: `${agent.name}: ${agent.error}` }); continue; }
    const current = agent.models.filter((model) => !model.legacy), older = agent.models.filter((model) => model.legacy);
    const open = olderOpen.includes(agent.harness);
    section(`agent:${agent.harness}`, agent.name, [...current, ...(open ? older : [])].map((model) => item(agent, model)));
    if (older.length) rows.push({ type: "more", key: `older:${agent.harness}`, hidden: older.length, label: open ? "Hide older models" : `${older.length} older` });
  }
  return rows;
}

const permissionWords: Record<PhonePermissionMode, string> = { supervised: "Ask first", "accept-edits": "Accept edits", "full-access": "Full access" };
/** The permissions a new thread runs with, in the window's words. */
export const permissionLabel = (mode: PhonePermissionMode) => permissionWords[mode];

/** The new thread's model control: "GPT-6.1 · High", or the model alone when it has no effort levels. */
export function choiceLabel(list: ModelList, choice: ModelChoice): ModelLabel {
  const model = modelOf(list, choice);
  const efforts = model?.efforts ?? [];
  const effort = choice.effort ?? (efforts.length ? model?.defaultEffort ?? null : null);
  return modelLabel(model?.name ?? choice.model, effort ? efforts.find((entry) => entry.id === effort)?.label ?? effortLabel(effort) : null);
}

/** A computer model's name, from its list when the phone has one, else its id. */
export const modelName = (models: readonly PhoneModel[] | undefined, id: string) => models?.find((model) => model.id === id)?.name ?? id;

/** Every model the computer listed, across its agents, for naming a thread's model. */
export const allModels = (list: ModelList | undefined) => (list ? listAgents(list).flatMap((agent) => agent.models) : undefined);

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
