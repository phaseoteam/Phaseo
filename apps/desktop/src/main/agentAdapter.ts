import type { Account, AgentActivity, AgentQuestion, Task } from "../shared/workspace";
import type { AttachmentContent } from "./attachments";
import type { AgentForm, FormAnswer } from "../shared/agentForms";

export type AgentCallbacks = {
	onDelta: (id: string, text: string) => void;
	onSession: (id: string) => void;
	onActivity?: (activity: AgentActivity & { append?: boolean }) => void;
	onQuestion?: (questions: AgentQuestion[]) => Promise<Record<string, string[]>>;
	onForm?: (form: AgentForm, signal?: AbortSignal) => Promise<FormAnswer | null>;
	onApproval: (method: string, description: string) => Promise<"accept" | "decline">;
};
export interface AgentAdapter {
	run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments?: AttachmentContent[]): Promise<void>;
	cancel(): Promise<void>;
}
