import type { Harness, Task, WorkspaceApi, WorkspaceCommand } from "../../shared/workspace";
import type { NativeAction } from "../../shared/nativeActions";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { attachmentsOnlyText } from "./MessageAttachments";
import { rememberModel, type ModelSelection } from "../lib/modelPreferences";

export type StartChat = {
	selection: ModelSelection;
	mode: Task["mode"];
	projectId?: string;
	permissionMode?: Task["permissionMode"];
	/** Starts the chat in Autopilot (experimental), with this spend cap. */
	autopilot?: { capNanos: number | null };
	text: string;
	images?: File[];
	/** Chats mentioned with `@`, which the agent can read. */
	threadReferences?: string[];
	/** Issues and pull requests mentioned with `#`, whose context the agent gets. */
	githubReferences?: string[];
	nativeAction?: NativeAction;
	/** Creates the chat another way, such as in a new worktree (WorktreeTarget); returns its id. */
	create?: (command: Extract<WorkspaceCommand, { type: "create-task" }>, text: string) => Promise<string | undefined>;
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
	const create: Extract<WorkspaceCommand, { type: "create-task" }> = {
		type: "create-task", harness: selection.harness, model: selection.model, mode: input.mode,
		...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
		...(input.autopilot ? { autopilot: input.autopilot } : {}),
		...(input.projectId ? { projectId: input.projectId } : {}),
		...(selection.accountId ? { accountId: selection.accountId } : {}),
		...selectionSettings(selection),
	};
	const id = input.create ? await input.create(create, input.text) : (await command(create))?.tasks.find(task => !known.has(task.id))?.id;
	if (!id) return;
	known.add(id);
	const attachments: string[] = [];
	for (const file of input.images ?? []) attachments.push((await api.pasteFile(id, file.name || "Pasted file", new Uint8Array(await file.arrayBuffer()))).id);
	rememberModel(selection);
	const text = input.nativeAction ? input.text : input.text.trim() || attachmentsOnlyText;
	// A failed first send leaves the message in the new chat's composer so it can be retried.
	const sent = await command({ type: "send", id, text, attachments,
		...(input.threadReferences?.length ? { threadReferences: input.threadReferences } : {}), ...(input.githubReferences?.length ? { githubReferences: input.githubReferences } : {}), ...(input.nativeAction ? { nativeAction: input.nativeAction } : {}) });
	if (!sent && input.text.trim()) keepDraft(id, input.text);
	return id;
}

/** Writes the draft the chat's composer reads when it opens (see useTaskDraft). */
function keepDraft(id: string, text: string) {
	try {
		const drafts = JSON.parse(window.localStorage.getItem("phaseo.desktop.messageDrafts") ?? "{}") as Record<string, string>;
		window.localStorage.setItem("phaseo.desktop.messageDrafts", JSON.stringify({ ...drafts, [id]: text }));
	} catch { /* The error banner still reports the failure when storage is unavailable. */ }
}
