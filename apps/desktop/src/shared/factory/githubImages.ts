/** Images GitHub keeps for issues and comments. Private repositories' ones need a sign-in, which the window doesn't have. */
export function isGithubImage(url: string): boolean {
	try {
		const { protocol, hostname, pathname } = new URL(url);
		if (protocol !== "https:") return false;
		if (hostname === "github.com") return /^\/(user-attachments\/assets\/|[\w.-]+\/[\w.-]+\/assets\/)/.test(pathname);
		return hostname === "private-user-images.githubusercontent.com" || hostname === "user-images.githubusercontent.com" || hostname === "raw.githubusercontent.com";
	} catch {
		return false;
	}
}

/** Where the window loads a GitHub image from: Factory reads it with gh's sign-in. */
export function githubImageSource(url: string): string {
	return `factory-image://image/?url=${encodeURIComponent(url)}`;
}
