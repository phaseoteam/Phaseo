import { effortLabel, type PhoneAgent, type PhoneBuild, type PhoneChatMode, type PhoneModel, type PhoneResults } from "@phaseo/phone-protocol";
import { harnessNames } from "../../shared/harnessNames";
import { mentionToken } from "../../shared/mentions";
import { phoneTriagePlaybook, triagePlaybookName, triageTitle, type TriageProject } from "../../shared/triage";
import { settingsProject, type ProjectModelDefault } from "../../shared/projectSettings";
import { connectedHarnesses, type RememberedModels } from "../../shared/rememberedModels";
import { runnableHarnesses, validateCommand, type Harness, type ModelOption, type Task, type WorkspaceCommand } from "../../shared/workspace";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { effortOptionIds, phoneChats, taskEffort } from "./phoneChats";

type CreateTask = Extract<WorkspaceCommand, { type: "create-task" }>;
const optionHarnesses = ["phaseo", "claude", "cursor", "pi", "opencode"];
/** The models a harness offers, as the window's picker reads them. */
export type DiscoverModels = (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
export type PhoneNewChat = { text: string; projectId?: string; mode: PhoneChatMode; model?: string; reasoningEffort?: string; harness?: string; accountId?: string; agentId?: string; workspace?: { kind: "worktree"; base: string } };
/** The window's New worktree (workspaceRuntime's startWorktreeChat): the worktree, then the chat in it, whose first message waits for its setup. */
export type StartWorktreeChat = (request: { projectId: string; base: string; text: string }, create: CreateTask) => Promise<string>;
export type PhoneModelsInput = { projectId?: string; mode?: PhoneChatMode };

/** What a phone's new chat needs from the app beyond the overview: the same sources the window's new-chat screen reads. */
export type PhoneModelSources = {
	discover: DiscoverModels;
	/** Local agents installed and signed in (main/connectedHarnesses.ts). */
	localHarnesses: () => Promise<readonly Harness[]>;
	/** The window's remembered model and favourites, mirrored to main. */
	remembered: () => RememberedModels;
	/** The permissions a chat ran with. */
	permissionOf: (taskId: string) => Task["permissionMode"];
};
type Agent = { harness: Harness; accountId?: string };

/**
 * The agents a new chat could run on, as the window's model picker lists them: Phaseo when a Phaseo account can call
 * the gateway, then each connected local agent. Grok runs only as a coding agent, so not in a plain chat. In a project
 * (Code or Plan), the agents the project turns off are left out.
 */
export function phoneAgentList(overview: WorkspaceOverview, local: readonly Harness[], input: PhoneModelsInput, now = Date.now()): Agent[] {
	const connected = connectedHarnesses(local, overview, now);
	const phaseo = overview.accounts.find(account => account.harness === "phaseo" && account.configured && !account.archived && (!account.oauthExpiresAt || Date.parse(account.oauthExpiresAt) > now));
	const hidden = input.mode !== "chat" ? settingsProject(overview.projects, input.projectId)?.settings?.disabledHarnesses ?? [] : [];
	const agents: Agent[] = [
		...phaseo ? [{ harness: "phaseo" as const, accountId: phaseo.id }] : [],
		...[...connected].filter(harness => harness !== "phaseo" && harness !== "acp" && runnableHarnesses.includes(harness) && (input.mode !== "chat" || harness !== "grok")).map(harness => ({ harness })),
	];
	return agents.filter(agent => !hidden.includes(agent.harness));
}

/**
 * The permissions a phone's chat runs with, since the phone shows them but can't choose: the project's default, else
 * the latest chat's (in the project if it has one). Undefined leaves the app's own default.
 */
export function phonePermission(overview: WorkspaceOverview, permissionOf: PhoneModelSources["permissionOf"], projectId?: string): Task["permissionMode"] {
	const preset = settingsProject(overview.projects, projectId)?.settings?.defaultPermissionMode;
	if (preset) return preset;
	const chats = phoneChats(overview);
	for (const task of [...chats.filter(value => projectId && value.projectId === projectId), ...chats]) {
		try { const mode = permissionOf(task.id); if (mode) return mode; } catch { /* Deleted since. */ }
	}
	return undefined;
}

/** A model's effort levels as the window's settings menu shows them: Codex and Grok list them on the model, and the
 * others describe a Reasoning (or Thinking) select among the model's options. Null when the model has no levels. */
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

function phoneModel(harness: Harness, model: ModelOption): PhoneModel {
	const efforts = modelEfforts(harness, model);
	return {
		id: model.id, name: model.name, ...efforts ? { efforts: efforts.efforts, ...efforts.defaultEffort ? { defaultEffort: efforts.defaultEffort } : {} } : {},
		...model.legacy ? { legacy: true as const } : {}, ...model.releaseDate ? { releaseDate: model.releaseDate } : {}, ...model.organisationId ? { organisationId: model.organisationId } : {},
		...model.serviceTiers?.length ? { fast: true as const } : {},
	};
}

/**
 * The model a new chat starts with, in the window's order: in a project (Code or Plan) its default model; otherwise the
 * person's remembered model (their default, else the last one picked); otherwise the Phaseo account's default model
 * (the catalog's default, else a Sonnet or GPT-6, else the first). Only agents that can run now count. Undefined when
 * none applies.
 */
export function phoneDefaultSelection(overview: WorkspaceOverview, agents: readonly Agent[], remembered: RememberedModels, input: PhoneModelsInput, phaseoModels: readonly ModelOption[]): ProjectModelDefault | undefined {
	// A Phaseo choice runs on the account that can call the gateway now.
	const runnable = (selection: ProjectModelDefault | undefined) => {
		const agent = selection && agents.find(value => value.harness === selection.harness && (value.harness !== "phaseo" || !selection.accountId || selection.accountId === value.accountId));
		return agent ? { ...selection!, ...agent.accountId ? { accountId: agent.accountId } : {} } : undefined;
	};
	const preset = input.mode !== "chat" ? settingsProject(overview.projects, input.projectId)?.settings?.defaultModel : undefined;
	const chosen = runnable(preset) ?? runnable(remembered.selection);
	if (chosen) return chosen;
	const phaseo = agents.find(agent => agent.harness === "phaseo");
	const model = phaseoModels.find(value => value.default) ?? phaseoModels.find(value => /claude-sonnet|gpt-6\b/i.test(value.id)) ?? phaseoModels[0];
	return phaseo && model ? { harness: "phaseo", accountId: phaseo.accountId, model: model.id } : undefined;
}

/** The app's command for a new chat on a chosen model and its settings. */
function createTask(selection: ProjectModelDefault & { agentId?: string }, input: PhoneModelsInput, permissionMode: Task["permissionMode"]): CreateTask {
	return {
		type: "create-task", harness: selection.harness, model: selection.model, mode: input.mode ?? "code",
		...input.projectId ? { projectId: input.projectId } : {}, ...permissionMode ? { permissionMode } : {},
		...selection.accountId ? { accountId: selection.accountId } : {}, ...selection.agentId ? { agentId: selection.agentId } : {},
		...["codex", "grok"].includes(selection.harness) && selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {},
		...selection.harness === "codex" && selection.serviceTier ? { serviceTier: selection.serviceTier } : {},
		...optionHarnesses.includes(selection.harness) && selection.options && Object.keys(selection.options).length ? { modelOptions: selection.options } : {},
	};
}

const noDefault = "Pick a model in a chat on the computer first, or sign in to Phaseo there, so a phone chat knows which model to use.";
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "Its models couldn't be read.";

/**
 * Every agent a new chat could run on with its models, read in parallel (an agent that fails gets its error, not a
 * failed frame), the model and effort it would use unasked, the window's favourites and the permissions it runs with.
 * `models` repeats the selected agent's models for phones from before agents.
 */
export async function phoneModels(overview: WorkspaceOverview, sources: PhoneModelSources, input: PhoneModelsInput): Promise<PhoneResults["list_models"]> {
	const agents = phoneAgentList(overview, await sources.localHarnesses().catch(() => []), input);
	const results = await Promise.allSettled(agents.map(agent => sources.discover(agent.harness, agent.accountId, input.projectId)));
	const listed: PhoneAgent[] = agents.map((agent, index) => {
		const result = results[index]!;
		return {
			harness: agent.harness, name: harnessNames[agent.harness], source: agent.harness === "phaseo" ? "phaseo" : "local", ...agent.accountId ? { accountId: agent.accountId } : {},
			models: result.status === "fulfilled" ? result.value.map(model => phoneModel(agent.harness, model)) : [],
			...result.status === "rejected" ? { error: errorText(result.reason) } : {},
		};
	});
	const phaseoIndex = agents.findIndex(agent => agent.harness === "phaseo"), phaseoResult = results[phaseoIndex];
	const remembered = sources.remembered();
	// With no default, the picker opens on the first model listed: shown, so the person sees it before sending.
	const first = listed.find(agent => agent.models.some(model => !model.legacy));
	const selection = phoneDefaultSelection(overview, agents, remembered, input, phaseoResult?.status === "fulfilled" ? phaseoResult.value : [])
		?? (first ? { harness: first.harness as Harness, ...first.accountId ? { accountId: first.accountId } : {}, model: first.models.find(model => !model.legacy)!.id } : undefined);
	if (!selection) throw new Error(noDefault);
	// Each harness is listed once.
	const agent = listed.find(value => value.harness === selection.harness)!;
	// When the agent can't be asked, the phone still sees the model the chat would use.
	if (!agent.models.some(model => model.id === selection.model)) agent.models.unshift({ id: selection.model, name: selection.model });
	const effort = taskEffort(createTask(selection, input, undefined));
	const permissionMode = phonePermission(overview, sources.permissionOf, input.projectId);
	return {
		agents: listed, models: agent.models, favourites: remembered.favourites,
		selected: { harness: agent.harness, ...agent.accountId ? { accountId: agent.accountId } : {}, model: selection.model, ...effort ? { reasoningEffort: effort } : {} },
		...permissionMode ? { permissionMode } : {},
	};
}

/**
 * The new chat's command: the agent and model the phone picked (one phoneModels listed), else the default selection.
 * Without either it refuses rather than guess.
 */
export async function phoneNewChat(overview: WorkspaceOverview, sources: PhoneModelSources, input: PhoneNewChat): Promise<CreateTask> {
	const agents = phoneAgentList(overview, await sources.localHarnesses().catch(() => []), input);
	const permissionMode = phonePermission(overview, sources.permissionOf, input.projectId);
	const remembered = sources.remembered();
	// The Phaseo catalog is read only when nothing else decides.
	const chosen = phoneDefaultSelection(overview, agents, remembered, input, []);
	if (input.harness) {
		const agent = agents.find(value => value.harness === input.harness && (input.harness !== "phaseo" || !input.accountId || input.accountId === value.accountId));
		if (!agent || input.agentId) throw new Error("That agent isn't available on this computer any more.");
		// The default model keeps its own settings (speed, options); a local agent keeps the sign-in its default uses.
		if (chosen?.harness === agent.harness && chosen.model === input.model) return createTask(chosen, input, permissionMode);
		const accountId = agent.accountId ?? (chosen?.harness === agent.harness ? chosen.accountId : undefined);
		return createTask({ harness: agent.harness, model: input.model!, ...accountId ? { accountId } : {} }, input, permissionMode);
	}
	const phaseo = agents.find(agent => agent.harness === "phaseo");
	const selection = chosen ?? phoneDefaultSelection(overview, agents, remembered, input, phaseo ? await sources.discover("phaseo", phaseo.accountId, input.projectId).catch(() => []) : []);
	if (!selection) throw new Error(noDefault);
	return createTask(selection, input, permissionMode);
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
export async function startPhoneChat(overview: () => WorkspaceOverview, command: (value: WorkspaceCommand) => Promise<WorkspaceOverview>, sources: PhoneModelSources, input: PhoneNewChat, worktree?: StartWorktreeChat) {
	const known = new Set(overview().tasks.map(task => task.id));
	const create = validateCommand(await withPhoneModel(await phoneNewChat(overview(), sources, input), sources.discover, input));
	let id: string | undefined;
	if (input.workspace) {
		if (!worktree || !input.projectId || create.type !== "create-task") throw new Error("This computer can't start a worktree for a phone.");
		id = await worktree({ projectId: input.projectId, base: input.workspace.base, text: input.text }, create);
	} else id = (await command(create)).tasks.find(task => !known.has(task.id))?.id;
	// As the window does, the first message is sent once the chat exists; a worktree chat's waits in its queue for the setup.
	if (!id) throw new Error("The chat could not be started.");
	await command({ type: "send", id, text: input.text });
	return id;
}

/** A phone's triage request, with the name the phone paired under. */
export type PhoneTriage = { text: string; build: PhoneBuild; diagnostics?: string; model?: string; reasoningEffort?: string; harness?: string; accountId?: string; agentId?: string; device: string };
export type PhoneTriageStarted = { chatId: string; commit: string; exact: boolean };
/** The app's triage checkout (main/triage.ts) as a project, and where its playbook goes. */
export type PhoneTriageSource = {
	prepare: (build: PhoneBuild) => Promise<{ projectId: string; directory: string; triage: TriageProject }>;
	writePlaybook: (directory: string, name: string, content: string) => Promise<unknown>;
};

/**
 * Triage started from a phone, as the window's Triage a Phaseo bug starts it: the phone build's source as a project, a
 * playbook in it, and a Code chat whose first message points at the playbook and carries the person's description.
 */
export async function startPhoneTriage(overview: () => WorkspaceOverview, command: (value: WorkspaceCommand) => Promise<WorkspaceOverview>, sources: PhoneModelSources, input: PhoneTriage, source: PhoneTriageSource): Promise<PhoneTriageStarted> {
	const { projectId, directory, triage } = await source.prepare(input.build);
	const playbook = triagePlaybookName(new Date(), true);
	await source.writePlaybook(directory, playbook, phoneTriagePlaybook({ build: input.build, triage, checkout: directory, device: input.device, ...input.diagnostics ? { diagnostics: input.diagnostics } : {} }));
	const text = `Read ${mentionToken({ kind: "file", ref: playbook, label: "triage-playbook.md" })} and follow it.\n\n${input.text}`;
	const { model, reasoningEffort, harness, accountId, agentId } = input;
	const id = await startPhoneChat(overview, command, sources, { text, projectId, mode: "code", ...model ? { model } : {}, ...reasoningEffort ? { reasoningEffort } : {}, ...harness ? { harness } : {}, ...accountId ? { accountId } : {}, ...agentId ? { agentId } : {} });
	await command({ type: "update-task", id, title: triageTitle(text) });
	return { chatId: id, commit: triage.commit, exact: triage.exact };
}

export type PhoneSetChat = { chatId: string; mode?: PhoneChatMode; model?: string; reasoningEffort?: string; defaultEffort?: true };
type UpdateTask = Extract<WorkspaceCommand, { type: "update-task" }>;

/**
 * A phone's change to a chat's settings as the window's own: the model is one its agent lists (another agent is a
 * handoff, which the phone doesn't offer), an effort is one that model offers and goes where that agent keeps it, and
 * the mode switches only between Code and Plan, as the window's Plan toggle does. A new model starts on its own default
 * effort unless one is given.
 */
export async function phoneSetChat(task: Task, discover: DiscoverModels, input: PhoneSetChat): Promise<UpdateTask> {
	const command: UpdateTask = { type: "update-task", id: task.id };
	if (input.mode && input.mode !== task.mode) {
		if (input.mode === "chat" || task.mode === "chat") throw new Error("A chat can switch only between Code and Plan.");
		command.mode = input.mode;
	}
	if (!input.model && !input.reasoningEffort && !input.defaultEffort) return command;
	const modelId = input.model ?? task.model;
	const model = (await discover(task.harness, task.accountId, task.projectId)).find(value => value.id === modelId);
	if (!model) throw new Error("That model isn't available on this computer any more.");
	if (modelId !== task.model) command.model = modelId;
	const efforts = modelEfforts(task.harness, model);
	// Back to the model's own effort, as the window stores it: an empty effort for Codex and Grok, no option for the rest.
	// A new model already starts on its own.
	if (input.defaultEffort) {
		if (command.model || !efforts) return command;
		if (efforts.setting === "reasoningEffort") return { ...command, reasoningEffort: "" };
		const { [efforts.setting]: _effort, ...options } = task.modelOptions ?? {};
		return { ...command, modelOptions: options };
	}
	if (!input.reasoningEffort) return command;
	if (!efforts?.efforts.some(effort => effort.id === input.reasoningEffort)) throw new Error(`${model.name} doesn't offer that effort.`);
	if (efforts.setting === "reasoningEffort") return { ...command, reasoningEffort: input.reasoningEffort };
	// The model's other options stay, unless the model changed (the window drops them with the old model).
	return { ...command, modelOptions: { ...command.model ? {} : task.modelOptions, [efforts.setting]: input.reasoningEffort } };
}
