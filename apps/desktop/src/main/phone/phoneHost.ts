import { effortLabel, type PhoneChatMode, type PhoneModel, type PhoneResults } from "@phaseo/phone-protocol";
import { settingsProject } from "../../shared/projectSettings";
import { validateCommand, type Harness, type ModelOption, type WorkspaceCommand } from "../../shared/workspace";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { effortOptionIds, phoneChats, taskEffort } from "./phoneChats";

type CreateTask = Extract<WorkspaceCommand, { type: "create-task" }>;
const optionHarnesses = ["phaseo", "claude", "cursor", "pi", "opencode"];
/** The models a harness offers, as the window's picker reads them. */
export type DiscoverModels = (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
export type PhoneNewChat = { text: string; projectId?: string; mode: PhoneChatMode; model?: string; reasoningEffort?: string };

/**
 * How a chat the phone starts is set up, since the phone can't choose permissions: the project's default model and
 * permissions when it has them, else the model of the person's latest chat (in that project if there is one).
 * Without either it refuses rather than guess.
 */
export function phoneNewChat(overview: WorkspaceOverview, input: { projectId?: string; mode: PhoneChatMode }): CreateTask {
	const settings = settingsProject(overview.projects, input.projectId)?.settings, project = input.projectId ? { projectId: input.projectId } : {};
	const permission = settings?.defaultPermissionMode ? { permissionMode: settings.defaultPermissionMode } : {};
	const preset = settings?.defaultModel;
	if (preset) return {
		type: "create-task", harness: preset.harness, model: preset.model, mode: input.mode, ...project, ...permission, ...preset.accountId ? { accountId: preset.accountId } : {},
		...["codex", "grok"].includes(preset.harness) && preset.reasoningEffort ? { reasoningEffort: preset.reasoningEffort } : {},
		...preset.harness === "codex" && preset.serviceTier ? { serviceTier: preset.serviceTier } : {},
		...optionHarnesses.includes(preset.harness) && preset.options && Object.keys(preset.options).length ? { modelOptions: preset.options } : {},
	};
	const chats = phoneChats(overview).filter(task => !settings?.disabledHarnesses?.includes(task.harness));
	const latest = chats.find(task => input.projectId && task.projectId === input.projectId) ?? chats[0];
	if (!latest) throw new Error("Start a chat on the computer first, so a phone chat knows which model to use.");
	return { type: "create-task", harness: latest.harness, model: latest.model, mode: input.mode, ...project, ...permission, ...latest.accountId ? { accountId: latest.accountId } : {}, ...latest.agentId ? { agentId: latest.agentId } : {} };
}

/**
 * A model's effort levels as the window's settings menu shows them: Codex and Grok list them on the model, and the
 * others describe a Reasoning (or Thinking) select among the model's options. Null when the model has no levels.
 */
export function modelEfforts(harness: Harness, model: ModelOption) {
	if (harness === "codex" || harness === "grok") {
		const efforts = model.reasoningEfforts?.map(effort => ({ id: effort.id, label: effortLabel(effort.id) })) ?? [];
		return efforts.length ? { setting: "reasoningEffort", efforts, defaultEffort: model.defaultReasoningEffort } : null;
	}
	if (!optionHarnesses.includes(harness)) return null;
	const select = model.options?.find(option => option.type === "select" && effortOptionIds.includes(option.id));
	if (select?.type !== "select" || !select.options.length) return null;
	return { setting: select.id, efforts: select.options.map(option => ({ id: option.id, label: option.label || effortLabel(option.id) })), defaultEffort: select.options.find(option => option.isDefault)?.id };
}

/** The models a phone may start a new chat with: those of the agent phoneNewChat picks, and what it would use unasked. */
export async function phoneModels(overview: WorkspaceOverview, discover: DiscoverModels, input: { projectId?: string }): Promise<PhoneResults["list_models"]> {
	const base = phoneNewChat(overview, { ...input, mode: "code" });
	const options = await discover(base.harness, base.accountId, base.projectId).catch(() => []);
	const models: PhoneModel[] = options.filter(model => !model.legacy || model.id === base.model).map(model => {
		const efforts = modelEfforts(base.harness, model);
		return { id: model.id, name: model.name, ...efforts ? { efforts: efforts.efforts, ...efforts.defaultEffort ? { defaultEffort: efforts.defaultEffort } : {} } : {} };
	});
	// When the harness can't be asked, the phone still sees the model the chat would use.
	if (!models.some(model => model.id === base.model)) models.unshift({ id: base.model, name: base.model });
	const effort = taskEffort(base);
	return { models, selected: { model: base.model, ...effort ? { reasoningEffort: effort } : {} } };
}

/**
 * The new chat's command with the phone's model and effort, checked against what the harness offers. Another model
 * drops the default's effort, speed and options, which belong to the default model.
 */
export async function withPhoneModel(base: CreateTask, discover: DiscoverModels, input: { model?: string; reasoningEffort?: string }): Promise<CreateTask> {
	if (!input.model && !input.reasoningEffort) return base;
	const modelId = input.model ?? base.model;
	const model = (await discover(base.harness, base.accountId, base.projectId)).find(value => value.id === modelId);
	if (!model) throw new Error("That model isn't available on this computer any more.");
	const { reasoningEffort: _effort, serviceTier: _tier, modelOptions: _options, ...rest } = base;
	const command: CreateTask = modelId === base.model ? base : { ...rest, model: modelId };
	if (!input.reasoningEffort) return command;
	const efforts = modelEfforts(base.harness, model);
	if (!efforts?.efforts.some(effort => effort.id === input.reasoningEffort)) throw new Error(`${model.name} doesn't offer that effort.`);
	if (efforts.setting === "reasoningEffort") return { ...command, reasoningEffort: input.reasoningEffort };
	return { ...command, modelOptions: { ...command.modelOptions, [efforts.setting]: input.reasoningEffort } };
}

/** Creates the chat through the app's commands, checked as the window's are, and sends its first message. */
export async function startPhoneChat(overview: () => WorkspaceOverview, command: (value: WorkspaceCommand) => Promise<WorkspaceOverview>, discover: DiscoverModels, input: PhoneNewChat) {
	const known = new Set(overview().tasks.map(task => task.id));
	const create = await withPhoneModel(phoneNewChat(overview(), input), discover, input);
	const created = await command(validateCommand(create));
	const id = created.tasks.find(task => !known.has(task.id))?.id;
	if (!id) throw new Error("The chat could not be started.");
	await command({ type: "send", id, text: input.text });
	return id;
}
