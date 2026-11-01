/** T3's Publish repository: a new GitHub repository for a project that has no remote yet. */
export type PublishRepositoryRequest = { name: string; owner?: string; visibility: "private" | "public"; description?: string };
export type PublishRepositoryResult = { repository: string; url: string; pushed: boolean };

/** GitHub's rules: letters, digits, `.`, `-` and `_`, up to 100 characters, and not `.` or `..`. */
export const validRepositoryName = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(value) && value !== "." && value !== "..";
const validOwner = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value);

/** A repository name suggested from a folder name, as GitHub suggests one. */
export const repositoryNameFrom = (folder: string) => folder.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "project";

export function validatePublishRepository(value: unknown): PublishRepositoryRequest {
	const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
	if (!validRepositoryName(input.name)) throw new Error("Use letters, numbers, dots, hyphens and underscores for the repository name.");
	if (input.owner !== undefined && !validOwner(input.owner)) throw new Error("Choose a GitHub account or organisation.");
	if (input.visibility !== "private" && input.visibility !== "public") throw new Error("Choose private or public.");
	if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 350 || /[\0\r\n]/.test(input.description))) throw new Error("Keep the description to one line of up to 350 characters.");
	return { name: input.name, visibility: input.visibility, ...(input.owner ? { owner: input.owner as string } : {}), ...(typeof input.description === "string" && input.description.trim() ? { description: input.description.trim() } : {}) };
}

/** Whether a push from this checkout lands on the repository's default branch, which asks first. */
export const pushesToDefaultBranch = (branch: string | undefined, current: { branch: string; defaultBranch?: string } | undefined) =>
	Boolean(branch) && current?.branch === branch && current?.defaultBranch === branch;
