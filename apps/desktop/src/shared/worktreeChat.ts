/**
 * Starting a Code chat in a new worktree from the new-chat composer's Workspace selector. The worktree
 * is made on a temporary branch, renamed from the first message (by the title model where one is set), and the
 * project's setup actions run before the agent starts. Progress is kept on the chat as `worktreeSetup`.
 */

export const worktreeBranchPrefix = "phaseo";

export type WorktreeSetupStageId = "checkout" | "branch" | "setup";
export type WorktreeSetupStatus = "pending" | "running" | "done" | "skipped" | "failed";
export type WorktreeSetupStage = { id: WorktreeSetupStageId; status: WorktreeSetupStatus; detail?: string };
/** A chat's worktree setup, shown in the chat until the agent starts. */
export type WorktreeSetup = {
	base: string; branch: string; stages: WorktreeSetupStage[];
	/** The setup action running or run, and its terminal. */
	script?: { name: string; command: string; terminalId?: string; exitCode?: number };
	startedAt: string; finishedAt?: string; error?: string;
};
export type WorktreeChatRequest = { projectId: string; base: string; text: string };

export const worktreeSetupStageLabels: Record<WorktreeSetupStageId, string> = { checkout: "Create the worktree", branch: "Name the branch", setup: "Run the setup action" };

/** A branch name fragment: lower case, safe characters, up to 64 long, never empty. */
export function sanitizeBranchFragment(raw: string) {
	const normalized = raw.trim().toLowerCase().replace(/['"`]/g, "").replace(/^[./\s_-]+|[./\s_-]+$/g, "");
	const fragment = normalized.replace(/[^a-z0-9/_-]+/g, "-").replace(/\/+/g, "/").replace(/-+/g, "-").replace(/^[./_-]+|[./_-]+$/g, "").slice(0, 64).replace(/[./_-]+$/g, "");
	return fragment || "update";
}

/** The temporary branch a new worktree starts on: the prefix and eight hex digits. */
export const temporaryWorktreeBranch = (hex: string) => `${worktreeBranchPrefix}/${hex.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 8)}`;
export const isTemporaryWorktreeBranch = (branch: string) => new RegExp(`^${worktreeBranchPrefix}/[0-9a-f]{8}$`).test(branch);

/** Static naming: the configured prefix, then the generated fragment without any prefix of its own. */
export function generatedBranchName(raw: string) {
	const fragment = sanitizeBranchFragment(raw.replace(new RegExp(`^${worktreeBranchPrefix}/`), ""));
	return `${worktreeBranchPrefix}/${fragment}`;
}

/** Without a title model, the branch comes from the first few words of the message. */
export function branchFromMessage(text: string) {
	const words = text.replace(/[@#]\S+/g, " ").split(/\s+/).filter(word => /[a-z0-9]/i.test(word)).slice(0, 6).join(" ");
	return generatedBranchName(words);
}

/** A free branch name: adds -2, -3 … until neither the name nor a branch nested under it exists. */
export function uniqueBranchName(existing: readonly string[], preferred: string) {
	const names = existing.map(name => name.toLowerCase()), taken = new Set(names), parts = preferred.split("/");
	let resolved = "";
	for (const [index, part] of parts.entries()) {
		const base = resolved ? `${resolved}/${part}` : part;
		let candidate = base;
		// A branch named like a folder blocks the refs under it, and the last part may not be a folder of existing refs.
		for (let suffix = 2; taken.has(candidate) || (index === parts.length - 1 && names.some(name => name.startsWith(`${candidate}/`))); suffix++) candidate = `${base}-${suffix}`;
		resolved = candidate;
	}
	return resolved;
}

/** The branch-name prompt, for the title model. */
export function branchNamePrompt(message: string) {
	return {
		system: [
			"You generate concise git branch names.",
			"Reply with the branch name only.",
			"Rules:",
			"- Branch should describe the requested work from the user message.",
			"- Return a valid Git branch name without spaces.",
			"- Keep it short and specific (2-6 words), in lowercase with hyphen-separated words.",
			"- Return only the descriptive branch fragment, without a prefix or namespace. The application adds the configured prefix.",
		].join("\n"),
		user: message.slice(0, 4000),
	};
}

export function validateWorktreeChatRequest(value: unknown): WorktreeChatRequest {
	const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
	const { projectId, base, text } = input;
	if (typeof projectId !== "string" || !projectId || projectId.length > 100) throw new Error("Choose a project for the worktree.");
	if (typeof base !== "string" || !base || base.length > 1000 || base.startsWith("-") || base.includes("\0")) throw new Error("Choose a base branch for the worktree.");
	if (typeof text !== "string" || text.length > 100000) throw new Error("Invalid first message.");
	return { projectId, base, text };
}

/** A setup that is still running, or failed before the agent could start. */
export const worktreeSetupActive = (setup?: WorktreeSetup) => Boolean(setup && (!setup.finishedAt || setup.error));
