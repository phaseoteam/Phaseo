/**
 * Starting a Code chat in a new worktree from the new-chat composer's Workspace selector. The worktree
 * is made on a temporary branch, renamed from the first message (by the Git text model where one is set), and the
 * project's setup actions run before the agent starts. Progress is kept on the chat as `worktreeSetup`.
 */
import { defaultSourceControlPreferences, preferenceLines, type SourceControlPreferences } from "./sourceControlPreferences";

/** How branches are named (Settings → Worktrees); the prefix is stored without a trailing slash and may be empty. */
export type BranchNamingOptions = Pick<SourceControlPreferences, "branchNaming" | "branchPrefix" | "branchInstructions">;
export const defaultBranchNaming: BranchNamingOptions = { branchNaming: defaultSourceControlPreferences.branchNaming, branchPrefix: defaultSourceControlPreferences.branchPrefix, branchInstructions: defaultSourceControlPreferences.branchInstructions };
const withPrefix = (prefix: string, name: string) => prefix ? `${prefix}/${name}` : name;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

/** A branch name fragment: lower case (unless keepCase), safe characters, up to 64 long, never empty. */
export function sanitizeBranchFragment(raw: string, keepCase = false) {
	const normalized = (keepCase ? raw.trim() : raw.trim().toLowerCase()).replace(/['"`]/g, "").replace(/^[./\s_-]+|[./\s_-]+$/g, "");
	const fragment = normalized.replace(keepCase ? /[^A-Za-z0-9/_-]+/g : /[^a-z0-9/_-]+/g, "-").replace(/\/+/g, "/").replace(/-+/g, "-").replace(/^[./_-]+|[./_-]+$/g, "").slice(0, 64).replace(/[./_-]+$/g, "");
	return fragment || "update";
}

/** The temporary branch a new worktree starts on: the prefix and eight hex digits (worktree-<hex> without a prefix, so it never reads as a commit). */
export const temporaryWorktreeBranch = (hex: string, prefix = defaultBranchNaming.branchPrefix) => { const digits = hex.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 8); return prefix ? `${prefix}/${digits}` : `worktree-${digits}`; };
export const isTemporaryWorktreeBranch = (branch: string, prefix = defaultBranchNaming.branchPrefix) => new RegExp(`^${prefix ? `${escapeRegExp(prefix)}/` : "worktree-"}[0-9a-f]{8}$`).test(branch);

/**
 * A model's (or the message's) name as a branch. Static naming puts the prefix before the fragment, dropping a prefix
 * the model added itself; semantic and custom naming use the model's whole name, which brings its own prefix.
 */
export function generatedBranchName(raw: string, naming: BranchNamingOptions = defaultBranchNaming) {
	if (naming.branchNaming !== "static") return sanitizeBranchFragment(raw, naming.branchNaming === "custom");
	const fragment = sanitizeBranchFragment(naming.branchPrefix ? raw.trim().replace(new RegExp(`^${escapeRegExp(naming.branchPrefix)}/`, "i"), "") : raw);
	return withPrefix(naming.branchPrefix, fragment);
}

/** Without a model, the branch comes from the first few words of the message, after the prefix in every naming mode. */
export function branchFromMessage(text: string, naming: BranchNamingOptions = defaultBranchNaming) {
	const words = text.replace(/[@#]\S+/g, " ").split(/\s+/).filter(word => /[a-z0-9]/i.test(word)).slice(0, 6).join(" ");
	return generatedBranchName(words, { ...naming, branchNaming: "static" });
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

/** The branch-name prompt, for the Git text model. Custom naming asks for the whole name, following the person's instructions. */
export function branchNamePrompt(message: string, naming: BranchNamingOptions = defaultBranchNaming) {
	return {
		system: [
			"You generate concise git branch names.",
			"Reply with the branch name only.",
			"Rules:",
			"- Branch should describe the requested work from the user message.",
			"- Return a valid Git branch name without spaces.",
			...naming.branchNaming === "custom" ? ["- Return the complete branch name, following the person's naming instructions. No prefix or suffix will be added."] : [
				"- Keep it short and specific (2-6 words), in lowercase with hyphen-separated words.",
				naming.branchNaming === "semantic" ? "- Start with a type prefix and a slash that describes the work, such as feat/add-search, fix/login-error, refactor/auth, docs/setup or chore/update-deps." : "- Return only the descriptive branch fragment, without a prefix or namespace. The application adds the configured prefix.",
			],
			...naming.branchNaming === "custom" ? preferenceLines(naming.branchInstructions, "Follow them for the branch name.") : [],
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
