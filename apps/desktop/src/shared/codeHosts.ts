/** The code hosts a project's origin remote can live on. GitHub keeps its own path through gh; the others share one layer. */
export type CodeHostKind = "github" | "gitlab" | "forgejo" | "bitbucket" | "azure";
export const codeHostKinds: CodeHostKind[] = ["github", "gitlab", "forgejo", "bitbucket", "azure"];
export const codeHostNames: Record<CodeHostKind, string> = { github: "GitHub", gitlab: "GitLab", forgejo: "Forgejo or Gitea", bitbucket: "Bitbucket", azure: "Azure DevOps" };
/** GitLab calls them merge requests; everyone else, pull requests. */
export const codeHostRequestNoun: Record<CodeHostKind, string> = { github: "pull request", gitlab: "merge request", forgejo: "pull request", bitbucket: "pull request", azure: "pull request" };

/** A self-hosted server the person told us about, for names that don't say which software runs there. */
export type CustomCodeHost = { host: string; kind: Exclude<CodeHostKind, "github" | "bitbucket" | "azure"> };
/**
 * Where a repository lives. `repository` is the host's own path: `owner/name` on GitHub, Forgejo and Bitbucket,
 * `group/subgroup/name` on GitLab and `organisation/project/name` on Azure DevOps. `webUrl` is the repository page.
 */
export type CodeHostRemote = { kind: CodeHostKind; host: string; repository: string; webUrl: string };
/** What a project's pull requests are read through, for the renderer to word things and link out. */
export type ProjectCodeHost = CodeHostRemote & { name: string; noun: string };

const segment = /^[A-Za-z0-9_.~-]{1,200}$/;
const safePath = (parts: string[]) => parts.length > 0 && parts.every(part => segment.test(part) && part !== "." && part !== "..");
export const validHostName = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$/i.test(value) && !value.includes("..");

/** The host and path of any remote form Git accepts: https, ssh:// and scp-like `git@host:path`. */
export function splitRemote(remote: string): { host: string; path: string[] } | undefined {
	const value = remote.trim();
	let host: string, path: string;
	const url = /^(?:https?|ssh|git):\/\/(?:[^@/\s]+@)?([^/\s]+)\/(.+)$/i.exec(value);
	const scp = url ? undefined : /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(value);
	if (url) { host = url[1]; path = url[2]; }
	else if (scp) { host = scp[1]; path = scp[2]; }
	else return;
	host = host.toLowerCase();
	// Ports belong to https and ssh transports, not to the host we talk to on the web; ssh ports would mislead the API.
	if (/^ssh:/i.test(value) || scp) host = host.replace(/:\d+$/, "");
	const parts = path.replace(/\/+$/, "").replace(/\.git$/i, "").split("/").filter(Boolean);
	if (!validHostName(host) || !parts.length) return;
	return { host, path: parts };
}

function kindOf(host: string, custom: readonly CustomCodeHost[]): CodeHostKind | undefined {
	const bare = host.replace(/:\d+$/, "");
	const saved = custom.find(entry => entry.host.toLowerCase() === host || entry.host.toLowerCase() === bare);
	if (saved) return saved.kind;
	if (bare === "github.com") return "github";
	if (bare === "bitbucket.org") return "bitbucket";
	if (bare === "dev.azure.com" || bare === "ssh.dev.azure.com" || bare === "vs-ssh.visualstudio.com" || bare.endsWith(".visualstudio.com")) return "azure";
	if (bare === "gitlab.com" || /(^|[.-])gitlab([.-]|$)/.test(bare)) return "gitlab";
	if (bare === "codeberg.org" || bare === "gitea.com" || /(^|[.-])(gitea|forgejo)([.-]|$)/.test(bare)) return "forgejo";
	return;
}

/** Which host an origin remote points at, or nothing when we can't tell (GitHub Enterprise and unknown servers). */
export function parseCodeHostRemote(remote: string, custom: readonly CustomCodeHost[] = []): CodeHostRemote | undefined {
	const split = splitRemote(remote);
	if (!split) return;
	const kind = kindOf(split.host, custom);
	if (!kind) return;
	let { path } = split;
	if (kind === "azure") {
		// https://dev.azure.com/org/project/_git/repo, https://org.visualstudio.com/[DefaultCollection/]project/_git/repo, git@ssh.dev.azure.com:v3/org/project/repo
		const visualStudio = /^([a-z0-9-]+)\.visualstudio\.com$/.exec(split.host);
		if (path[0] === "v3") path = path.slice(1);
		else if (visualStudio) path = [visualStudio[1], ...path.filter(part => part !== "DefaultCollection")];
		const git = path.indexOf("_git");
		if (git >= 0) path = [...path.slice(0, git), ...path.slice(git + 1)];
		if (path.length === 2) path = [path[0], path[1], path[1]];
		let decoded: string[];
		try { decoded = path.map(decodeURIComponent); } catch { return; }
		// Azure DevOps project names may hold spaces.
		if (decoded.length !== 3 || !decoded.every(part => part.length > 0 && part.length <= 200 && ![...part].some(character => character.charCodeAt(0) < 32) && !/[/\\?#%]/.test(part) && part !== "." && part !== "..")) return;
		path = decoded;
		return { kind, host: "dev.azure.com", repository: path.join("/"), webUrl: `https://dev.azure.com/${path.map(encodeURIComponent).join("/").replace(/\/([^/]+)$/, "/_git/$1")}` };
	}
	if (!safePath(path) || (kind === "gitlab" ? path.length < 2 || path.length > 20 : path.length !== 2)) return;
	const host = kind === "github" || kind === "bitbucket" ? split.host.replace(/:\d+$/, "") : split.host;
	return { kind, host, repository: path.join("/"), webUrl: `https://${host}/${path.join("/")}` };
}

/** The web address of one pull or merge request. */
export function codeHostRequestUrl(remote: CodeHostRemote, number: number) {
	switch (remote.kind) {
		case "gitlab": return `${remote.webUrl}/-/merge_requests/${number}`;
		case "bitbucket": return `${remote.webUrl}/pull-requests/${number}`;
		case "azure": return `${remote.webUrl}/pullrequest/${number}`;
		case "forgejo": case "github": return `${remote.webUrl}/pull/${number}`;
	}
}

export function validateCustomCodeHosts(value: unknown): CustomCodeHost[] {
	if (!Array.isArray(value) || value.length > 50) throw new Error("Invalid server list.");
	const seen = new Set<string>();
	return value.map(entry => {
		const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
		const host = typeof item.host === "string" ? item.host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "") : "";
		if (!validHostName(host) || seen.has(host) || (item.kind !== "gitlab" && item.kind !== "forgejo")) throw new Error("Enter a server name such as git.example.com, and choose GitLab or Forgejo.");
		seen.add(host);
		return { host, kind: item.kind };
	});
}
