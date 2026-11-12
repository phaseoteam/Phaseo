/** Workspace preferences for worktrees, branch names, submodules, the folder Add project opens, and the instructions and model for titles, commits, pull requests and review guides (Settings → Source control and Worktrees). Saved with the rest in WorkspacePreferences.sourceControl. */

/** How a new worktree's branch is named from the first message: the prefix and a short name, a type prefix the model picks (feat/, fix/ …), or the person's own instructions. */
export type BranchNaming = "static" | "semantic" | "custom";
/** Which git submodules a new worktree checks out: all of them and theirs, only the ones the repository declares, or none. */
export type WorktreeSubmodules = "recursive" | "top-level" | "none";
export type SourceControlPreferences = {
	/** The folder new worktrees are made in; null for the worktrees folder in Phaseo's data folder. Existing worktrees stay where they are. */
	worktreeDirectory: string | null;
	branchNaming: BranchNaming;
	/** Put before new worktree branch names, without a trailing slash; empty for none. */
	branchPrefix: string;
	/** The person's branch naming instructions, used when branchNaming is custom. */
	branchInstructions: string;
	submodules: WorktreeSubmodules;
	/** The folder Add project opens in; null for the system's choice. */
	addProjectDirectory: string | null;
	/** The person's instructions, added to the prompts for chat titles, commit messages and pull request text, and review guides. */
	titleInstructions: string; writingInstructions: string; reviewGuideInstructions: string;
	/** Pull request descriptions fill in the repository's pull request template when it has one. */
	followPullRequestTemplate: boolean;
	/** The Phaseo model for commit messages, pull request text and branch names, and the one for review guides; null for the title model. */
	gitModel: string | null; reviewGuideModel: string | null;
};
export const defaultSourceControlPreferences: SourceControlPreferences = { worktreeDirectory: null, branchNaming: "static", branchPrefix: "phaseo", branchInstructions: "", submodules: "recursive", addProjectDirectory: null, titleInstructions: "", writingInstructions: "", reviewGuideInstructions: "", followPullRequestTemplate: true, gitModel: null, reviewGuideModel: null };

export const branchNamingModes: readonly BranchNaming[] = ["static", "semantic", "custom"];
export const worktreeSubmoduleModes: readonly WorktreeSubmodules[] = ["recursive", "top-level", "none"];
/** The longest instructions the prompts take. */
export const instructionsLimit = 4000;

/** Why a branch prefix is not a safe start for a Git branch name, or undefined when it is. A trailing slash is allowed and dropped. */
export function branchPrefixProblem(value: string) {
	const prefix = value.replace(/\/+$/, "");
	if (!prefix) return undefined;
	if (prefix.length > 60) return "Keep the branch prefix to 60 characters.";
	// Each part separated by / follows Git's ref rules: no leading dot or dash, no "..", no trailing "." or ".lock", nothing outside letters, digits, . _ and -.
	if (prefix.includes("..") || prefix.split("/").some(part => !/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(part) || part.endsWith(".") || part.toLowerCase().endsWith(".lock"))) return "Use letters, numbers, dots, dashes and underscores in the branch prefix, with slashes between parts. A part can't start with a dot or dash.";
	return undefined;
}
export const normalizeBranchPrefix = (value: string) => value.trim().replace(/\/+$/, "");

/** An absolute folder on Windows (C:\…, \\server\share) or elsewhere (/…). */
const absoluteFolder = (value: string) => /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/)/.test(value);
const hasControl = (value: string) => [...value].some(character => character.charCodeAt(0) < 32);

/** Preferences saved before a field existed omit it, so missing fields take their defaults; a present but invalid value throws. */
export function validateSourceControlPreferences(value: unknown): SourceControlPreferences {
	if (value === undefined) return { ...defaultSourceControlPreferences };
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid sourceControl preferences.");
	const input = value as Record<string, unknown>;
	const read = <K extends keyof SourceControlPreferences>(key: K) => (input[key] === undefined ? defaultSourceControlPreferences[key] : input[key]) as unknown;
	const folder = (key: "worktreeDirectory" | "addProjectDirectory", label: string) => { const entry = read(key); if (entry !== null && (typeof entry !== "string" || !absoluteFolder(entry) || entry.length > 1000 || hasControl(entry))) throw new Error(`Choose a full folder path for ${label}.`); return entry; };
	const text = (key: "branchInstructions" | "titleInstructions" | "writingInstructions" | "reviewGuideInstructions", label: string) => { const entry = read(key); if (typeof entry !== "string" || entry.length > instructionsLimit) throw new Error(`Keep ${label} to ${instructionsLimit.toLocaleString("en-US")} characters.`); return entry; };
	const model = (key: "gitModel" | "reviewGuideModel", label: string) => { const entry = read(key); if (entry !== null && (typeof entry !== "string" || !entry.trim() || entry.length > 200 || hasControl(entry))) throw new Error(`Choose a valid model for ${label}.`); return entry; };
	const branchNaming = read("branchNaming"), submodules = read("submodules"), prefix = read("branchPrefix"), followPullRequestTemplate = read("followPullRequestTemplate");
	if (!branchNamingModes.includes(branchNaming as BranchNaming)) throw new Error("Choose how worktree branches are named.");
	if (!worktreeSubmoduleModes.includes(submodules as WorktreeSubmodules)) throw new Error("Choose how worktrees check out submodules.");
	if (typeof prefix !== "string") throw new Error("Invalid branch prefix.");
	const problem = branchPrefixProblem(prefix.trim()); if (problem) throw new Error(problem);
	if (typeof followPullRequestTemplate !== "boolean") throw new Error("Invalid pull request template setting.");
	return {
		worktreeDirectory: folder("worktreeDirectory", "worktrees"), branchNaming: branchNaming as BranchNaming, branchPrefix: normalizeBranchPrefix(prefix), branchInstructions: text("branchInstructions", "branch naming instructions"),
		submodules: submodules as WorktreeSubmodules, addProjectDirectory: folder("addProjectDirectory", "Add project"),
		titleInstructions: text("titleInstructions", "chat title instructions"), writingInstructions: text("writingInstructions", "commit and pull request instructions"), reviewGuideInstructions: text("reviewGuideInstructions", "review guide instructions"),
		followPullRequestTemplate, gitModel: model("gitModel", "commits and pull requests"), reviewGuideModel: model("reviewGuideModel", "review guides"),
	};
}

/** The person's instructions as the closing lines of a system prompt, or nothing when there are none. */
export function preferenceLines(instructions: string | undefined, rules = "Follow them unless they conflict with the reply format above.") {
	const text = instructions?.trim().slice(0, instructionsLimit);
	return text ? ["", `The person's preferences. ${rules}`, "<preferences>", text, "</preferences>"] : [];
}
