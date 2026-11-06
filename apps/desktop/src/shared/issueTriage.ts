/**
 * A GitHub issue typed into the palette: its URL, or `#123` / `123` in the project's own repository (owner/repo).
 * Undefined until the text names one.
 */
export function issueToTriage(text: string, repository?: string): string | undefined {
	const value = text.trim();
	const url = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\/?(?:[?#].*)?$/i.exec(value);
	if (url) return `https://github.com/${url[1]}/${url[2]}/issues/${url[3]}`;
	const number = /^#?(\d{1,9})$/.exec(value);
	return number && repository && /^[\w.-]+\/[\w.-]+$/.test(repository) ? `https://github.com/${repository}/issues/${number[1]}` : undefined;
}

/** The first message of a triage chat: understand and reproduce before changing anything. */
export const issueTriagePrompt = (url: string) => `Triage ${url}. Read the issue and its comments with gh, reproduce the problem in this project, find the root cause and say how sure you are. Propose a fix, then wait for me before changing code or opening a pull request.`;
