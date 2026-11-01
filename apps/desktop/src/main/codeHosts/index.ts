import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { git } from "../gitProcess";
import { resolveNativeCommand } from "../nativeProcess";
import { codeHostNames, codeHostRequestNoun, parseCodeHostRemote, validateCustomCodeHosts, validHostName, type CodeHostKind, type CodeHostRemote, type CustomCodeHost } from "../../shared/codeHosts";
import type { CodeHostSettings, SavedCodeHostToken } from "../../shared/codeHostSettings";
import type { PullRequestView } from "../../shared/pullRequestView";
import { azureProvider } from "./azure";
import { bitbucketProvider } from "./bitbucket";
import type { CodeHostProvider } from "./common";
import { forgejoProvider } from "./forgejo";
import { gitlabProvider } from "./gitlab";
import { azureCliToken, CodeHostError, glabRequester, httpRequester, teaRequester, type HostRequest } from "./transport";

type Vault = { set: (id: string, value: string) => Promise<void>; get: (id: string) => Promise<string>; remove: (id: string) => void };
type Stored = { custom: CustomCodeHost[]; tokens: SavedCodeHostToken[] };
let configured: { file: string; vault: Vault } | undefined;
let stored: Stored = { custom: [], tokens: [] };

/** Tokens live in the credential vault; this file only says which hosts have one, and which servers run what. */
export function configureCodeHosts(directory: string, vault: Vault) {
	configured = { file: path.join(directory, "code-hosts.json"), vault };
	try {
		const value = existsSync(configured.file) ? JSON.parse(readFileSync(configured.file, "utf8")) as Partial<Stored> : {};
		stored = { custom: validateCustomCodeHosts(value.custom ?? []), tokens: (Array.isArray(value.tokens) ? value.tokens : []).filter(token => token && typeof token.kind === "string" && validHostName(token.host)) };
	} catch { stored = { custom: [], tokens: [] }; }
}
function persist() {
	if (!configured) throw new Error("Code host settings are unavailable.");
	writeFileSync(`${configured.file}.tmp`, JSON.stringify(stored, null, "\t"));
	renameSync(`${configured.file}.tmp`, configured.file);
}
const secretId = (kind: CodeHostKind, host: string) => `code-host-${kind}-${Buffer.from(host).toString("hex")}`;
const savedToken = async (kind: CodeHostKind, host: string) => {
	if (!configured || !stored.tokens.some(token => token.kind === kind && token.host === host)) return;
	return await configured.vault.get(secretId(kind, host)).catch(() => undefined);
};

/** Where a remote lives, when it is somewhere other than GitHub. */
export function otherCodeHost(remote: string): CodeHostRemote | undefined {
	const parsed = parseCodeHostRemote(remote, stored.custom);
	return parsed && parsed.kind !== "github" ? parsed : undefined;
}

async function requester(root: string, remote: CodeHostRemote): Promise<HostRequest> {
	const token = await savedToken(remote.kind, remote.host);
	switch (remote.kind) {
		case "gitlab": return token ? httpRequester(`https://${remote.host}/api/v4`, { "PRIVATE-TOKEN": token }) : glabRequester(root, remote.host);
		case "forgejo": return token ? httpRequester(`https://${remote.host}/api/v1`, { Authorization: `token ${token}` }) : teaRequester(root, `https://${remote.host}`, remote.repository);
		case "bitbucket": {
			if (!token) throw new CodeHostError("Save a Bitbucket access token or API token in Settings, Code hosts.");
			const saved = JSON.parse(token) as { email?: string; token: string };
			return httpRequester("https://api.bitbucket.org/2.0", { Authorization: saved.email ? `Basic ${Buffer.from(`${saved.email}:${saved.token}`).toString("base64")}` : `Bearer ${saved.token}` });
		}
		case "azure": {
			const organisation = remote.repository.split("/")[0];
			return httpRequester(`https://dev.azure.com/${encodeURIComponent(organisation)}`, { Authorization: token ? `Basic ${Buffer.from(`:${token}`).toString("base64")}` : `Bearer ${await azureCliToken(root)}` });
		}
		case "github": throw new Error("GitHub has its own path.");
	}
}

const factories = { gitlab: gitlabProvider, forgejo: forgejoProvider, bitbucket: bitbucketProvider, azure: azureProvider };
/** Wraps each call so a host's failure reads as one sentence that names the host and never carries a credential. */
function explained(provider: CodeHostProvider): CodeHostProvider {
	const name = codeHostNames[provider.remote.kind], noun = codeHostRequestNoun[provider.remote.kind];
	const wrap = <T>(work: Promise<T>, doing: string) => work.catch((reason: unknown) => {
		if (!(reason instanceof CodeHostError)) throw reason;
		if (!reason.status) throw new Error(reason.detail ? `${reason.message} ${reason.detail}` : reason.message, { cause: reason });
		const why = reason.status === 401 ? `${name} did not accept the sign-in. Sign in again or save a new token in Settings, Code hosts.` : reason.status === 403 ? `${name} refused: this account can't do that here.` : reason.status === 404 ? `${name} could not find it, or this account can't see it.` : reason.status === 429 ? `${name} is limiting requests. Try again in a minute.` : `${name} said: ${reason.detail || reason.message}`;
		throw new Error(`Could not ${doing}. ${why}`, { cause: reason });
	});
	const host = { name, noun, repositoryUrl: provider.remote.webUrl };
	const tag = (view: PullRequestView): PullRequestView => ({ ...view, codeHost: host });
	return {
		...provider,
		list: cursor => wrap(provider.list(cursor), `load ${noun}s`),
		view: number => wrap(provider.view(number).then(tag), `load this ${noun}`),
		act: (current, action) => wrap(provider.act(current, action), action.type === "merge" ? "merge" : action.type === "comment" ? "post the comment" : `update the ${noun}`),
		forBranch: branch => wrap(provider.forBranch(branch), `find this branch's ${noun}`),
		create: input => wrap(provider.create(input), `create the ${noun}`),
	};
}

/** The provider for a checkout, or nothing when its origin is on GitHub or a host we can't name; those keep the gh path. */
export async function codeHostProvider(root: string, remote?: string): Promise<CodeHostProvider | undefined> {
	let origin = remote;
	if (origin === undefined) { try { origin = await git(root, ["remote", "get-url", "origin"]); } catch { return; } }
	const found = otherCodeHost(origin);
	if (!found || found.kind === "github") return;
	const request = await requester(root, found);
	return explained(factories[found.kind](found, request));
}

export async function codeHostSettings(): Promise<CodeHostSettings> {
	const available = (name: string) => resolveNativeCommand(name).then(() => true, () => false);
	const [glab, tea, az] = await Promise.all([available("glab"), available("tea"), available("az")]);
	return { custom: stored.custom, tokens: stored.tokens, clis: { glab, tea, az } };
}
export async function saveCodeHostToken(kind: CodeHostKind, host: string, secret: string) {
	if (!configured) throw new Error("Code host settings are unavailable.");
	await configured.vault.set(secretId(kind, host), secret);
	stored = { ...stored, tokens: [...stored.tokens.filter(token => token.kind !== kind || token.host !== host), { kind, host, savedAt: new Date().toISOString() }] };
	persist();
}
export function removeCodeHostToken(kind: CodeHostKind, host: string) {
	if (!configured) throw new Error("Code host settings are unavailable.");
	configured.vault.remove(secretId(kind, host));
	stored = { ...stored, tokens: stored.tokens.filter(token => token.kind !== kind || token.host !== host) };
	persist();
}
export function saveCustomCodeHosts(value: unknown) { stored = { ...stored, custom: validateCustomCodeHosts(value) }; persist(); }
