export type IntegrationId =
	| "codex"
	| "claude-code"
	| "opencode"
	| "fx"
	| "deepseek-harness"
	| "pi"
	| "prime-agent"
	| "hermes"
	| "aider"
	| "cline"
	| "roo-code"
	| "kilo-code"
	| "continue"
	| "cursor"
	| "zed"
	| "openclaw";

export type IntegrationStatus = "not-installed" | "available" | "configured" | "conflict";

export type IntegrationInspection = {
	id: IntegrationId;
	name: string;
	status: IntegrationStatus;
	configPath: string;
	details: string[];
};

export type FileChange = {
	path: string;
	before: string | null;
	after: string | null;
	description: string;
};

export type IntegrationModel = {
	id: string;
	name: string;
	contextWindow?: number;
	maxOutputTokens?: number;
	reasoning?: boolean;
	input?: Array<"text" | "image">;
};

export type IntegrationOptions = {
	homeDir: string;
	model?: string;
	models?: IntegrationModel[];
};

export interface IntegrationAdapter {
	readonly id: IntegrationId;
	readonly name: string;
	readonly guideUrl?: string;
	inspect(options: IntegrationOptions): Promise<IntegrationInspection>;
	planSetup(options: IntegrationOptions): Promise<FileChange[]>;
	planRemove(options: IntegrationOptions): Promise<FileChange[]>;
	planCredential?(options: IntegrationOptions, credential: string): Promise<FileChange[]>;
	setupInstructions?(options: IntegrationOptions): string[];
	removeInstructions?(options: IntegrationOptions): string[];
	applySetup?(options: IntegrationOptions): Promise<void>;
	applyRemove?(options: IntegrationOptions): Promise<void>;
	readonly setupIsAutomatic?: boolean;
}
