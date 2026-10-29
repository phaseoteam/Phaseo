import type { PullRequest } from "../../../shared/pullRequests";

/**
 * The pull requests `#` offers (T3's filterComposerPullRequestMatches and rankPullRequestMatches): a number matches by
 * prefix, words by title, branch or author; linked ones come first, then an exact number, then the newest.
 */
export function pullRequestMatches<T extends Pick<PullRequest, "number" | "title" | "head" | "author" | "updatedAt">>(requests: T[], query: string, linked: number[] = [], limit = 20): T[] {
	const seen = new Set<number>(), needle = query.trim().toLowerCase(), numeric = /^\d*$/.test(needle);
	const unique = requests.filter(request => !seen.has(request.number) && seen.add(request.number));
	const matching = unique.filter(request => !needle || (numeric ? String(request.number).startsWith(needle) : [request.title, request.head, request.author].some(value => value.toLowerCase().includes(needle))));
	const rank = (request: T) => (linked.includes(request.number) ? 2 : 0) + (numeric && needle && String(request.number) === needle ? 1 : 0);
	return matching.sort((left, right) => rank(right) - rank(left) || right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit);
}
