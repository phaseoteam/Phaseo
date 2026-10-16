import { parsePullRequestReference, pullRequestUrl } from "../../../shared/pullRequestView";

export type ResolvedLink = { host: string; repository: string; number: number; url: string };
/**
 * Which pull request the link dialog's text names, or why it cannot (T3's resolveLinkPullRequestInput): a URL or
 * `owner/repo#N` carries its repository, a bare `#N` or `N` means the chat's own. Null when it is not a reference yet.
 */
export function resolveLinkInput(reference: string, repository: string | null | undefined): { link: ResolvedLink } | { error: string } | null {
	const parsed = parsePullRequestReference(reference);
	if (!parsed) return null;
	const owner = parsed.repository ?? repository;
	if (!owner) return { error: "Paste a full URL to link a pull request from another repository." };
	return { link: { host: "github.com", repository: owner, number: parsed.number, url: pullRequestUrl(owner, parsed.number) } };
}
/** What the dialog says under the input, once the person has typed. */
export function linkValidation(reference: string, resolved: ReturnType<typeof resolveLinkInput>) {
	if (!reference.trim()) return "Paste a pull request URL or enter 123 / #123.";
	if (!resolved) return "Use a pull request URL, 123, or #123.";
	return "error" in resolved ? resolved.error : null;
}

/**
 * What the checkout dialog accepts (T3's parsePullRequestReference): a pull request URL, a `gh pr checkout` command
 * (its flags ignored), or 123 / #123. Pull requests in another repository than the project's are refused, since the
 * checkout happens in the project.
 */
export function parseCheckoutReference(input: string, repository: string | null | undefined): { number: number } | { error: string } | null {
	const command = /^\s*gh\s+pr\s+checkout\s+(.+)$/i.exec(input);
	const argument = command ? command[1].split(/\s+/).find(word => word && !word.startsWith("-")) ?? "" : input;
	const parsed = parsePullRequestReference(argument);
	if (!parsed) return null;
	if (parsed.repository && repository && parsed.repository.toLowerCase() !== repository.toLowerCase()) return { error: `That pull request is in ${parsed.repository}, not this project's repository.` };
	if (parsed.repository && !repository) return { error: "This project has no GitHub repository to check the pull request out in." };
	return { number: parsed.number };
}
