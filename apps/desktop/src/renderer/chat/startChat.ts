import type { Harness, Task, WorkspaceApi, WorkspaceCommand } from "../../shared/workspace";
import type { NativeAction } from "../../shared/nativeActions";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { rememberModel, type ModelSelection } from "../lib/modelPreferences";

export type StartChat = {
	selection: ModelSelection;
	mode: Task["mode"];
	projectId?: string;
	permissionMode?: Task["permissionMode"];
	text: string;
	images?: File[];
	/** Chats mentioned with `@`, which the agent can read. */
	threadReferences?: string[];
	nativeAction?: NativeAction;
};

/** Harnesses whose per-model settings travel as `modelOptions` rather than effort and speed fields. */
export const optionHarnesses: Harness[] = ["phaseo", "claude", "cursor", "pi", "opencode"];

/** Reasoning and speed settings are only accepted by harnesses that expose them. */
export function selectionSettings(selection: ModelSelection) {
	return {
		...(["codex", "grok"].includes(selection.harness) && selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
		...(selection.harness === "codex" && selection.serviceTier ? { serviceTier: selection.serviceTier } : {}),
		...(optionHarnesses.includes(selection.harness) && selection.options && Object.keys(selection.options).length ? { modelOptions: selection.options } : {}),
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
	// A first message that fails leaves no empty chat behind, and the caller keeps the draft.
	const sent = await command({ type: "send", id, text: input.nativeAction ? input.text : input.text.trim() || "Please review the attached images.", attachments,
		...(input.threadReferences?.length ? { threadReferences: input.threadReferences } : {}), ...(input.nativeAction ? { nativeAction: input.nativeAction } : {}) });
	// Archived through the API directly so the send error stays on screen.
	if (!sent) { await api.command({ type: "update-task", id, archived: true }).catch(() => undefined); return; }
	return id;
}
