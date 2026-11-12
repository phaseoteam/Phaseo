import { execFile } from "node:child_process";
import { resolveNativeCommand } from "../nativeProcess";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
/** One JSON call to a host's REST API, relative to its API root. Throws a CodeHostError on any HTTP failure. */
export type HostRequest = (method: HttpMethod, path: string, body?: unknown) => Promise<unknown>;

export class CodeHostError extends Error {
	constructor(message: string, readonly status?: number, readonly detail?: string) { super(message); }
}
/** A host's own words, without anything that looks like a credential. */
export const scrub = (text: string) => text.replace(/\b(?:glpat-|gl[a-z]{2,4}-|ATCTT|ATATT)[A-Za-z0-9_=-]+/g, "[hidden]").replace(/\b[A-Za-z0-9+/_=-]{32,}\b/g, "[hidden]").slice(0, 240);

export type CliRun = (command: string, args: string[], options: { cwd: string; input?: string; env?: NodeJS.ProcessEnv }) => Promise<{ stdout: string; stderr: string }>;
/** Runs a host CLI without a shell. Bodies travel on stdin so they never show in a process list. */
export const runCli: CliRun = async (name, args, options) => {
	let command: Awaited<ReturnType<typeof resolveNativeCommand>>;
	try { command = await resolveNativeCommand(name); } catch { throw Object.assign(new CodeHostError(`${name} was not found.`), { code: "ENOENT" }); }
	return await new Promise((resolve, reject) => {
		const child = execFile(command.executable, [...command.prefix, ...args], { cwd: options.cwd, windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...options.env } }, (error, stdout, stderr) => {
			if (error) reject(Object.assign(new CodeHostError(`${name} failed`), { code: (error as NodeJS.ErrnoException).code, stderr: String(stderr ?? ""), stdout: String(stdout ?? "") }));
			else resolve({ stdout: String(stdout), stderr: String(stderr) });
		});
		child.stdin?.on("error", () => {});
		child.stdin?.end(options.input ?? "");
	});
};

const parseJson = (text: string) => { if (!text.trim()) return null; try { return JSON.parse(text) as unknown; } catch { throw new CodeHostError("The host returned an unreadable answer."); } };
function hostMessage(body: string) {
	try {
		const value = JSON.parse(body) as Record<string, unknown>, error = value.error;
		const message = value.message ?? (error && typeof error === "object" ? (error as Record<string, unknown>).message : error);
		return typeof message === "string" ? message : message ? JSON.stringify(message) : "";
	} catch { return body; }
}

/** REST over fetch with a saved token. Every path is relative to `base`; nothing leaves for another origin. */
export function httpRequester(base: string, headers: Record<string, string>, fetcher: typeof fetch = fetch): HostRequest {
	const root = base.replace(/\/+$/, "");
	return async (method, path, body) => {
		if (/^[a-z]+:/i.test(path) || path.startsWith("//")) throw new CodeHostError("Invalid host path.");
		const response = await fetcher(`${root}/${path.replace(/^\/+/, "")}`, { method, headers: { Accept: "application/json", ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: AbortSignal.timeout(20_000) });
		const text = await response.text();
		if (!response.ok) throw new CodeHostError(`HTTP ${response.status}`, response.status, scrub(hostMessage(text)));
		return parseJson(text);
	};
}

/** GitLab through `glab api`, signed in with glab. GITLAB_HOST picks the server for self-hosted instances. */
export function glabRequester(cwd: string, host: string, run: CliRun = runCli): HostRequest {
	return async (method, path, body) => {
		try {
			// glab --input omits GitLab's required Content-Type, so it is set by hand.
			const { stdout } = await run("glab", ["api", path, "--method", method, ...(body === undefined ? [] : ["--input", "-", "--header", "Content-Type: application/json"])], { cwd, env: { GITLAB_HOST: host, NO_PROMPT: "1" }, ...(body === undefined ? {} : { input: JSON.stringify(body) }) });
			return parseJson(stdout);
		} catch (reason) {
			if ((reason as NodeJS.ErrnoException).code === "ENOENT") throw new CodeHostError("Install GitLab CLI (glab) and sign in with glab auth login, or save a GitLab token in Settings, Code hosts.");
			if (reason instanceof CodeHostError && reason.message !== "glab failed") throw reason;
			const stderr = String((reason as { stderr?: unknown }).stderr ?? ""), status = Number(/\b([45]\d{2})\b/.exec(stderr)?.[1]) || undefined;
			throw new CodeHostError(status ? `HTTP ${status}` : "glab failed", status, scrub(stderr.split(/\r?\n/).find(line => line.trim()) ?? ""));
		}
	};
}

/** Forgejo or Gitea through `tea api`, signed in with tea login add. tea exits 0 on HTTP errors, so the status comes from --include. */
export function teaRequester(cwd: string, base: string, repository: string, run: CliRun = runCli): HostRequest {
	return async (method, path, body) => {
		let output: { stdout: string; stderr: string };
		try { output = await run("tea", ["api", "--include", "--repo", repository, "--method", method, ...(body === undefined ? [] : ["--data", "@-"]), `${base.replace(/\/+$/, "")}/api/v1/${path}`], { cwd, ...(body === undefined ? {} : { input: JSON.stringify(body) }) }); }
		catch (reason) {
			if ((reason as NodeJS.ErrnoException).code === "ENOENT") throw new CodeHostError("Install Gitea CLI (tea) and sign in with tea login add, or save a token for this server in Settings, Code hosts.");
			throw new CodeHostError("tea failed", undefined, scrub(String((reason as { stderr?: unknown }).stderr ?? "")));
		}
		const status = Number(/^HTTP\/\S+ (\d{3})/m.exec(output.stderr)?.[1] ?? /^HTTP\/\S+ (\d{3})/m.exec(output.stdout)?.[1]);
		// Some tea builds print the headers on stdout before the body.
		const text = /^HTTP\//.test(output.stdout) ? output.stdout.slice(output.stdout.search(/\r?\n\r?\n/)).trim() : output.stdout;
		if (!status || status >= 400) throw new CodeHostError(status ? `HTTP ${status}` : "tea did not report an HTTP status", status || undefined, scrub(hostMessage(text)));
		return parseJson(text);
	};
}

/** Azure DevOps' resource id: an az login token for it works against the REST API. */
const azureDevOpsResource = "499b84ac-1321-427f-aa17-267ca6975798";
export async function azureCliToken(cwd: string, run: CliRun = runCli): Promise<string> {
	try {
		const token = (await run("az", ["account", "get-access-token", "--resource", azureDevOpsResource, "--query", "accessToken", "--output", "tsv", "--only-show-errors"], { cwd })).stdout.trim();
		if (!token || /\s/.test(token)) throw new CodeHostError("Azure CLI returned no token.");
		return token;
	} catch (reason) {
		if ((reason as NodeJS.ErrnoException).code === "ENOENT") throw new CodeHostError("Install Azure CLI and sign in with az login, or save a personal access token in Settings, Code hosts.");
		if (reason instanceof CodeHostError && reason.message !== "az failed") throw reason;
		throw new CodeHostError("Sign in to Azure CLI with az login, or save a personal access token in Settings, Code hosts.");
	}
}
