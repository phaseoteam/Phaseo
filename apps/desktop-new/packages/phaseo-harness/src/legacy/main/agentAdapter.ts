import type { AgentActivity, AgentQuestion } from "../shared/workspace.js";
import type { AgentForm, FormAnswer } from "../shared/agentForms.js";

export type AgentCallbacks = {
  onDelta: (id: string, text: string) => void;
  onActivity?: (activity: AgentActivity & { append?: boolean }) => void;
  onQuestion?: (questions: AgentQuestion[]) => Promise<Record<string, string[]>>;
  onForm?: (form: AgentForm, signal?: AbortSignal) => Promise<FormAnswer | null>;
  onApproval: (
    method: string,
    description: string,
    toolCallId?: string,
  ) => Promise<"accept" | "decline">;
};
export class AgentInputRejectedError extends Error {}
