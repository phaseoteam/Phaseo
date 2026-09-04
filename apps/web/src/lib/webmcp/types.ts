export type WebMCPTool = {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: {
		readOnlyHint?: boolean;
		untrustedContentHint?: boolean;
	};
	execute: (
		input: Record<string, unknown>,
		options?: { signal?: AbortSignal },
	) => Promise<string> | string;
};

export type ModelContext = {
	registerTool: (
		tool: WebMCPTool,
		options?: { signal?: AbortSignal; exposedTo?: string[] },
	) => Promise<void> | void;
};

declare global {
	interface Document {
		modelContext?: ModelContext;
	}
}
