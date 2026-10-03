import type { AgentForm, FormAnswer } from "./agentForms";
export const harnesses = ["phaseo", "codex", "claude", "opencode", "pi", "cursor", "grok", "antigravity", "acp"] as const;
export type Harness = typeof harnesses[number];
export type TaskStatus = "idle" | "running" | "waiting" | "limited" | "failed" | "interrupted" | "completed";
export type Project = { id: string; name: string; directory: string; createdAt: string };
export type Account = { id: string; name: string; harness: Harness; kind: "native" | "api"; endpoint?: string; configDirectory?: string; configured: boolean; archived?: boolean; secretId?: string };
export type AgentConnection = { id: string; name: string; executable: string; arguments: string[] };
export type Attachment = { id: string; taskId: string; name: string; kind: "text" | "image"; mimeType: string; size: number; pages?: number };
export type Message = { id: string; role: "user" | "assistant" | "system" | "tool"; text: string; attachments?: Attachment[]; delivery?: "steer"; createdAt: string };
export type QueuedMessage = { id: string; text: string; attachments?: Attachment[]; createdAt: string };
export type SteeringMessage = QueuedMessage & { status: "sending" | "rejected" | "unconfirmed"; error?: string };
export type AgentActivity = { id: string; type: "tool" | "reasoning" | "plan" | "usage"; title: string; text: string; status?: "running" | "completed" | "failed" };
export type AgentQuestion = { id: string; header: string; question: string; isOther?: boolean; isSecret?: boolean; multiSelect?: boolean; options?: { label: string; description?: string }[] | null };
export type Task = {
	id: string; projectId?: string; title: string; harness: Harness; accountId?: string;
	agentId?: string;
	model: string; mode: "chat" | "code" | "plan"; status: TaskStatus; pinned: boolean;
	archived: boolean; messages: Message[]; queue: QueuedMessage[]; nativeSessionId?: string;
	parentId?: string; nativeForkFrom?: string; createdAt: string; updatedAt: string; error?: string;
	handoffFrom?: Harness;
	approvals?: { id: string; method: string; description: string }[];
	questions?: { id: string; questions: AgentQuestion[] }[];
	forms?: { id: string; form: AgentForm }[];
	steering?: SteeringMessage[];
	activities?: AgentActivity[];
};
export type Workspace = { version: 1; projects: Project[]; accounts: Account[]; agents: AgentConnection[]; tasks: Task[] };
export type HarnessInstallation = { harness: Harness; installed: boolean; version?: string; error?: string };
export type ModelOption = { id: string; name: string; description?: string; default?: boolean };
export type UsageWindow = { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null };
export type AccountStatus = { checkedAt: string; authenticated: boolean | null; method?: string; identity?: string; plan?: string; ordinaryUsageAllowed?: boolean | null; usage?: { id: string; name: string; primary: UsageWindow | null; secondary: UsageWindow | null; spendControlReached: boolean | null }[]; usageError?: string };
export type ProjectFile = { name: string; path: string; directory: boolean };
export type GitFile = { path: string; oldPath?: string; indexStatus: string; worktreeStatus: string };
export type GitReview = { status: string; files: GitFile[]; diff: string; stagedDiff: string; branch: string };
export type GitCommand = { type: "stage" | "unstage"; filename: string } | { type: "create-branch" | "switch-branch"; name: string } | { type: "commit"; message: string };
export type TerminalSession = { id: string; projectId?: string; title: string; cwd: string; output: string; status: "running" | "exited" | "interrupted"; exitCode?: number; createdAt: string; updatedAt: string };
export type TerminalCommand = { type: "open"; projectId?: string } | { type: "write"; id: string; data: string } | { type: "resize"; id: string; columns: number; rows: number } | { type: "close" | "delete"; id: string };
export type TerminalEvent = { sessionId: string; data?: string; session?: TerminalSession };
export type WorkspaceCommand =
	| { type: "add-account"; name: string; harness: "codex" | "claude" | "phaseo"; kind: "native" | "api"; endpoint?: string; apiKey?: string }
	| { type: "update-account"; id: string; name?: string; endpoint?: string; apiKey?: string; archived?: boolean }
	| { type: "add-agent"; name: string; executable: string; arguments: string[] }
	| { type: "create-task"; projectId?: string; harness: Harness; accountId?: string; agentId?: string; model: string; mode: Task["mode"] }
	| { type: "handoff"; id: string; projectId?: string; harness: Harness; accountId?: string; agentId?: string; model: string; mode: Task["mode"] }
	| { type: "update-task"; id: string; title?: string; pinned?: boolean; archived?: boolean }
	| { type: "send"; id: string; text: string; attachments?: string[] }
	| { type: "steer"; id: string; text: string; attachments?: string[] }
	| { type: "steer-queue" | "steer-discard"; id: string; messageId: string }
	| { type: "cancel"; id: string }
	| { type: "resume"; id: string }
	| { type: "fork"; id: string }
	| { type: "approval"; id: string; approvalId: string; decision: "accept" | "decline" }
	| { type: "answer"; id: string; requestId: string; answers: Record<string, string[]> }
	| { type: "form-answer"; id: string; requestId: string; answer: FormAnswer | null }
	| { type: "queue-remove"; id: string; messageId: string }
	| { type: "queue-edit"; id: string; messageId: string; text: string }
	| { type: "queue-move"; id: string; messageId: string; direction: "up" | "down" };
export type WorkspaceApi = {
	get: () => Promise<Workspace>;
	command: (command: WorkspaceCommand) => Promise<Workspace>;
	chooseProject: () => Promise<Workspace>;
	chooseAttachments: (taskId: string) => Promise<{ attachments: Attachment[]; errors: string[] }>;
	exportTask: (taskId: string, format: "markdown" | "json") => Promise<boolean>;
	importTask: (configuration: Extract<WorkspaceCommand, { type: "create-task" }>) => Promise<{ workspace: Workspace; taskId: string } | undefined>;
	attachment: (taskId: string, id: string) => Promise<{ attachment: Attachment; text?: string; dataUrl?: string }>;
	installations: () => Promise<HarnessInstallation[]>;
	models: (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
	openLink: (url: string) => Promise<void>;
	terminals: () => Promise<TerminalSession[]>;
	terminal: (command: TerminalCommand) => Promise<TerminalSession[]>;
	onTerminalEvent: (listener: (event: TerminalEvent) => void) => () => void;
	signIn: (accountId: string) => Promise<Workspace>;
	accountStatus: (harness: "codex" | "claude", accountId?: string) => Promise<AccountStatus>;
	cancelSignIn: (accountId: string) => Promise<void>;
	listFiles: (projectId: string, directory: string) => Promise<ProjectFile[]>;
	readFile: (projectId: string, filename: string) => Promise<string>;
	readDocument: (projectId: string, filename: string) => Promise<{ text: string; hash: string }>;
	writeDocument: (projectId: string, filename: string, text: string, expectedHash: string) => Promise<{ hash: string }>;
	gitReview: (projectId: string) => Promise<GitReview>;
	gitCommand: (projectId: string, command: GitCommand) => Promise<GitReview>;
	gitBranches: (projectId: string) => Promise<string[]>;
	onChange: (listener: (workspace: Workspace) => void) => () => void;
};

export function emptyWorkspace(): Workspace {
	return { version: 1, projects: [], accounts: [], agents: [], tasks: [] };
}

function validateApiEndpoint(endpoint: string) {
	const url = new URL(endpoint);
	if (url.search || url.hash) throw new Error("Use an endpoint URL without query parameters or fragments.");
	if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use HTTPS or a local model endpoint.");
}

export function validateCommand(value: unknown): WorkspaceCommand {
	if (!value || typeof value !== "object") throw new Error("Invalid workspace command.");
	const command = value as Record<string, unknown>;
	const string = (key: string, required = true, max = 1000) => {
		const input = command[key];
		if (!required && input === undefined) return;
		if (typeof input !== "string" || !input.trim() || input.length > max) throw new Error(`Invalid ${key}.`);
	};
	if (command.type === "add-agent") {
		string("name", true, 100); string("executable");
		if (!Array.isArray(command.arguments) || command.arguments.length > 100 || command.arguments.some(value => typeof value !== "string" || value.includes("\0") || value.length > 10000)) throw new Error("Invalid agent arguments.");
	} else if (command.type === "add-account") {
		string("name", true, 100);
		if (!["codex", "claude", "phaseo"].includes(command.harness as string)) throw new Error("Invalid account harness.");
		if (command.kind === "api" && command.harness === "phaseo") {
			string("endpoint"); string("apiKey", true, 10000);
			validateApiEndpoint(command.endpoint as string);
		} else if (command.kind !== "native" || command.harness === "phaseo") throw new Error("Invalid account type.");
	} else if (command.type === "create-task" || command.type === "handoff") {
		if (command.type === "handoff") string("id");
		if (!harnesses.includes(command.harness as Harness)) throw new Error("Unknown harness.");
		if (!["chat", "code", "plan"].includes(command.mode as string)) throw new Error("Invalid task mode.");
		string("model"); string("projectId", false); string("accountId", false); string("agentId", false);
	} else {
		string("id");
		switch (command.type) {
			case "update-account":
				string("name", false, 100); string("endpoint", false); string("apiKey", false, 10000);
				if (command.endpoint !== undefined) validateApiEndpoint(command.endpoint as string);
				if (command.archived !== undefined && typeof command.archived !== "boolean") throw new Error("Invalid archived state.");
				break;
			case "update-task":
				string("title", false, 200);
				for (const key of ["pinned", "archived"]) if (command[key] !== undefined && typeof command[key] !== "boolean") throw new Error(`Invalid ${key}.`);
				break;
			case "send": case "steer":
				string("text", true, 100000);
				if (command.attachments !== undefined && (!Array.isArray(command.attachments) || command.attachments.length > 10 || command.attachments.some(id => typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) || new Set(command.attachments).size !== command.attachments.length)) throw new Error("Invalid attachments.");
				break;
			case "cancel": case "resume": case "fork": break;
			case "approval":
				string("approvalId");
				if (command.decision !== "accept" && command.decision !== "decline") throw new Error("Invalid approval decision.");
				break;
			case "form-answer": {
				string("requestId");
				if (command.answer === null) break;
				if (!command.answer || typeof command.answer !== "object" || Array.isArray(command.answer)) throw new Error("Invalid form answer.");
				const entries = Object.entries(command.answer);
				if (entries.length > 100 || entries.some(([key, value]) => !key || key.length > 1000 || !(typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= 10000) || (Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === "string" && item.length <= 10000))))) throw new Error("Invalid form answer.");
				break;
			}
			case "answer": {
				string("requestId");
				if (!command.answers || typeof command.answers !== "object" || Array.isArray(command.answers)) throw new Error("Invalid answers.");
				const entries = Object.entries(command.answers);
				if (!entries.length || entries.length > 100 || entries.some(([key, values]) => !key || !Array.isArray(values) || !values.length || values.length > 100 || values.some(value => typeof value !== "string" || !value.trim() || value.length > 10000))) throw new Error("Invalid answers.");
				break;
			}
			case "queue-remove": case "steer-queue": case "steer-discard": string("messageId"); break;
			case "queue-edit": string("messageId"); string("text", true, 100000); break;
			case "queue-move":
				string("messageId");
				if (command.direction !== "up" && command.direction !== "down") throw new Error("Invalid queue direction.");
				break;
			default: throw new Error("Unknown workspace command.");
		}
	}
	return value as WorkspaceCommand;
}
