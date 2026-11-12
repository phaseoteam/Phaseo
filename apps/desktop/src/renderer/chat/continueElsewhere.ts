import type { Task, WorkspaceCommand } from "../../shared/workspace";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { rememberModel, type ModelSelection } from "../lib/modelPreferences";
import { selectionSettings } from "./startChat";

type Command = (value: WorkspaceCommand) => Promise<WorkspaceOverview | undefined>;
export const continuePrompt = "Continue where you left off.";

/**
 * Moves a limited chat to another login or model through the handoff, then sends what was waiting in its queue (or asks
 * it to continue). The queued text leaves the original chat and any scheduled resume is cancelled, so the work is not
 * done, and paid for, twice. Queued messages with files stay in the original chat too, since the files belong to it.
 */
export async function continueElsewhere(command: Command, task: Pick<Task, "id" | "mode" | "projectId" | "permissionMode" | "queue" | "usageLimit">, selection: ModelSelection, known: Set<string>) {
	const state = await command({ type: "handoff", id: task.id, harness: selection.harness, model: selection.model, mode: task.mode,
		...(task.projectId ? { projectId: task.projectId } : {}), ...(selection.accountId ? { accountId: selection.accountId } : {}), ...(task.permissionMode ? { permissionMode: task.permissionMode } : {}), ...selectionSettings(selection) });
	const id = state?.tasks.find(value => !known.has(value.id))?.id;
	if (!id) return;
	rememberModel(selection);
	const waiting = task.queue.filter(message => !message.autopilot && !message.notice && message.text.trim());
	const sent = await command({ type: "send", id, text: waiting.map(message => message.text.trim()).join("\n\n") || continuePrompt });
	if (sent) {
		for (const message of waiting) if (!message.attachments?.length) await command({ type: "queue-remove", id: task.id, messageId: message.id });
		if (task.usageLimit?.resumeAt) await command({ type: "resume-at-reset", id: task.id, cancel: true });
	}
	return { id, filesLeft: waiting.some(message => message.attachments?.length) };
}
