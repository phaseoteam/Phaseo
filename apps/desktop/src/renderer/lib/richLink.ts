export function richLink(value: string) {
	try {
		const url = new URL(value);
		if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
		const github = url.hostname === "github.com";
		const match = github ? /^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)(?:\/|$)/.exec(url.pathname) : null;
		return { github, label: match ? `${match[3] === "pull" ? "PR" : "Issue"} #${match[4]}` : undefined, fallback: url.hostname.replace(/^www\./, "") };
	} catch { return undefined; }
}
