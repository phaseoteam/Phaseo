import type { ThreadTools } from "../shared/orchestration";
import type { NativeAction } from "../shared/nativeActions";
import type { Account, AgentActivity, AgentQuestion, ApprovalDecision, ModelOption, QueuedMessage, Task } from "../shared/workspace";
import type { AttachmentContent } from "./attachments";
import type { AgentForm, FormAnswer } from "../shared/agentForms";
import type { HarnessUsage } from "../shared/usageLedger";
import type { BackgroundWork } from "./backgroundWork";

export type AgentCallbacks = {
	threads?: ThreadTools;
	onDelta: (id: string, text: string) => void;
	onSession: (id: string) => void;
	onModels?: (models: ModelOption[]) => void;
	onModes?: (modes: ModelOption[]) => void;
	onTerminalAuth?: (args: string[], env: Record<string, string>, title: string, signal: AbortSignal) => Promise<void>;
	onActivity?: (activity: AgentActivity & { append?: boolean }) => void;
	/** One model response's tokens, from a harness Phaseo doesn't bill; the same key again replaces it as it grows. */
	onUsage?: (usage: HarnessUsage) => void;
	/**
	 * Answers keyed by question id; {} when dismissed. A "message" request resolves at once with {}: the person's
	 * answer reaches the agent later as a user message (Codex async questions). origin names who is asking.
	 */
	onQuestion?: (questions: AgentQuestion[], request?: { responseMode?: "message"; origin?: string; /** Withdraws the question (an MCP request the server cancelled). */ signal?: AbortSignal }) => Promise<Record<string, string[]>>;
	/** null cancels; "decline" refuses (MCP and ACP tell the two apart). */
	onForm?: (form: AgentForm, signal?: AbortSignal) => Promise<FormAnswer | null | "decline">;
	/** "always" and "never" come back only when offered, with the agent's own labels for those choices. ask holds the request for the person even with full access. */
	onApproval: (method: string, description: string, choices?: { always?: string; never?: string }, options?: { ask?: boolean }) => Promise<ApprovalDecision>;
	/** Background tasks of this turn that background_wait keeps it open for (Claude). */
	background?: BackgroundWork;
	/** A proposed plan (Markdown): implement it, or revise it with the person's feedback. */
	onPlan?: (plan: string) => Promise<PlanDecision>;
};
export type PlanDecision = { decision: "accept" } | { decision: "decline"; feedback?: string };
export interface AgentAdapter {
	run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments?: AttachmentContent[], nativeAction?: NativeAction): Promise<void>;
	steer?: (message: QueuedMessage, attachments: AttachmentContent[]) => Promise<void>;
	cancel(): Promise<void>;
}
export class AgentInputRejectedError extends Error {}
