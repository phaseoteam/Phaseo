/** What the diff surface compares: the branch against its base, uncommitted work, or one agent turn. */
export type GitDiffRequest =
	| { scope: "branch"; baseRef?: string; ignoreWhitespace?: boolean }
	| { scope: "uncommitted"; ignoreWhitespace?: boolean }
	| { scope: "turn"; from: string; to: string; ignoreWhitespace?: boolean };
export type GitDiffResult = { patch: string; hash: string; truncated: boolean; headRef?: string; baseRef?: string; repository: boolean };
export type GitRefs = { local: string[]; remote: string[]; current: string };
/** Working-tree snapshots taken before and after a turn, as Git tree ids. */
export type TurnCheckpoint = { before: string; after?: string };
/** A file restoring a snapshot would change: added since (it goes), modified or deleted since (it comes back). */
export type CheckpointChange = { path: string; status: "added" | "modified" | "deleted" };

const treeId = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
export const isTreeId = (value: unknown): value is string => typeof value === "string" && treeId.test(value);

/** Git ref names a person can pick as a comparison base; `git check-ref-format` runs as well in the main process. */
export function isRefName(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 250 && !value.startsWith("-") && !/[\0\s~^:?*[\\]|\.\.|@\{|\/\/|\/$|\.lock$|^\/|\.$/.test(value);
}

export function validateGitDiffRequest(value: unknown): GitDiffRequest {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid diff request.");
	const request = value as Record<string, unknown>;
	if (request.ignoreWhitespace !== undefined && typeof request.ignoreWhitespace !== "boolean") throw new Error("Invalid diff request.");
	const ignoreWhitespace = request.ignoreWhitespace === true;
	if (request.scope === "uncommitted") return { scope: "uncommitted", ignoreWhitespace };
	if (request.scope === "branch") {
		if (request.baseRef !== undefined && !isRefName(request.baseRef)) throw new Error("Choose a valid branch to compare against.");
		return { scope: "branch", ...(request.baseRef ? { baseRef: request.baseRef as string } : {}), ignoreWhitespace };
	}
	if (request.scope === "turn") {
		if (!isTreeId(request.from) || !isTreeId(request.to)) throw new Error("This turn has no saved snapshot.");
		return { scope: "turn", from: request.from, to: request.to, ignoreWhitespace };
	}
	throw new Error("Invalid diff request.");
}
