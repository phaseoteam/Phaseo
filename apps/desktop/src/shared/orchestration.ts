import type { Harness, ModelOption, TaskStatus } from "./workspace";

export type Delegation = { parentTaskId: string; requestId: string; background?: boolean; role?: string; kind?: "fork" | "handoff"; sourceTaskId?: string; sourceMessageId?: string };
export type ThreadSummary = { id: string; title: string; harness: Harness; model: string; status: TaskStatus; parentId?: string; error?: string };
export type DelegateRequest = { requestId: string; prompt: string; title: string; harness?: Harness; model?: string; accountId?: string; background?: boolean; role?: string };
export type ThreadTools = {
	handoff?: (id: string, request: { requestId: string; harness: Harness; model: string; accountId?: string }) => Promise<ThreadSummary>;
	rename?: (id: string, title: string) => Promise<ThreadSummary>;
	steer?: (id: string, text: string) => Promise<ThreadSummary>;
	queue?: (id: string) => { id: string; text: string; createdAt: string }[];
	editQueue?: (id: string, messageId: string, text?: string) => Promise<ThreadSummary>;
	fork?: (id: string, requestId: string, messageId?: string) => Promise<ThreadSummary>;
	send?: (id: string, text: string) => Promise<ThreadSummary>;
	merge?: (id: string, requestId: string) => Promise<ThreadSummary>;
	models?: (harness: Harness, accountId?: string, query?: string) => Promise<{ models: ModelOption[]; total: number; accounts: { id: string; name: string }[] }>;
	list: (query?: string) => ThreadSummary[];
	read: (id: string) => { thread: ThreadSummary; messages: { role: string; text: string; createdAt: string }[]; truncated: boolean };
	delegate: (request: DelegateRequest) => Promise<ThreadSummary>;
	wait: (id: string, timeoutMs?: number) => Promise<{ thread: ThreadSummary; timedOut: boolean; result?: string }>;
	interrupt: (id: string) => Promise<ThreadSummary>;
};
