import type { PhoneChatMode } from "@phaseo/phone-protocol";
import { settingsProject } from "../../shared/projectSettings";
import type { WorkspaceCommand } from "../../shared/workspace";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { phoneChats } from "./phoneChats";

type CreateTask = Extract<WorkspaceCommand, { type: "create-task" }>;
const optionHarnesses = ["phaseo", "claude", "cursor", "pi", "opencode"];

/**
 * How a chat the phone starts is set up, since the phone can't choose models or permissions: the project's default
 * model and permissions when it has them, else the model of the person's latest chat (in that project if there is one).
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

/** Creates the chat through the app's commands and sends its first message, as the new-chat composer does. */
export async function startPhoneChat(overview: () => WorkspaceOverview, command: (value: WorkspaceCommand) => Promise<WorkspaceOverview>, input: { text: string; projectId?: string; mode: PhoneChatMode }) {
	const known = new Set(overview().tasks.map(task => task.id));
	const created = await command(phoneNewChat(overview(), input));
	const id = created.tasks.find(task => !known.has(task.id))?.id;
	if (!id) throw new Error("The chat could not be started.");
	await command({ type: "send", id, text: input.text });
	return id;
}
