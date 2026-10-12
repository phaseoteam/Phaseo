import type { Task, WorkspaceApi, WorkspaceCommand } from "../../shared/workspace";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { rememberModel, type ModelSelection } from "../lib/modelPreferences";

export type StartChat = {
	selection: ModelSelection;
	mode: Task["mode"];
	projectId?: string;
	permissionMode?: Task["permissionMode"];
	text: string;
	images?: File[];
};

/** Reasoning and speed settings are only accepted by harnesses that expose them. */
export function selectionSettings(selection: ModelSelection) {
	return {
		...(["codex", "grok"].includes(selection.harness) && selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
		...(selection.harness === "codex" && selection.serviceTier ? { serviceTier: selection.serviceTier } : {}),
	};
}

/** Create a chat for one model and send its first message. Returns the new chat id. */
export async function startChat(api: WorkspaceApi, command: (value: WorkspaceCommand) => Promise<WorkspaceOverview | undefined>, known: Set<string>, input: StartChat) {
	const { selection } = input;
	const state = await command({
		type: "create-task", harness: selection.harness, model: selection.model, mode: input.mode,
		...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
		...(input.projectId ? { projectId: input.projectId } : {}),
		...(selection.accountId ? { accountId: selection.accountId } : {}),
		...selectionSettings(selection),
	});
	const id = state?.tasks.find(task => !known.has(task.id))?.id;
	if (!id) return;
	known.add(id);
	const attachments: string[] = [];
	for (const file of input.images ?? []) attachments.push((await api.pasteImage(id, file.name, new Uint8Array(await file.arrayBuffer()))).id);
	rememberModel(selection);
	await command({ type: "send", id, text: input.text.trim() || "Please review the attached images.", attachments });
	return id;
}
