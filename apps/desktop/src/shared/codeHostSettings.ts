import { validHostName, type CodeHostKind, type CustomCodeHost } from "./codeHosts";

/** A host with a token in the credential vault. The token itself never leaves the main process. */
export type SavedCodeHostToken = { kind: CodeHostKind; host: string; savedAt: string };
/** Settings ▸ Code hosts: saved servers and tokens, and which host CLIs this computer has. */
export type CodeHostSettings = { custom: CustomCodeHost[]; tokens: SavedCodeHostToken[]; clis: { glab: boolean; tea: boolean; az: boolean } };
export type CodeHostTokenRequest = { kind: Exclude<CodeHostKind, "github">; host: string; token: string; email?: string };

/** Bitbucket and Azure DevOps each have one cloud server, so their tokens are filed under it. */
export const fixedCodeHost: Partial<Record<CodeHostKind, string>> = { bitbucket: "bitbucket.org", azure: "dev.azure.com" };

export function validateCodeHostTokenRequest(value: unknown): CodeHostTokenRequest {
	const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const kind = input.kind;
	if (kind !== "gitlab" && kind !== "forgejo" && kind !== "bitbucket" && kind !== "azure") throw new Error("Choose a code host.");
	const host = fixedCodeHost[kind] ?? (typeof input.host === "string" ? input.host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "") : "");
	if (!validHostName(host)) throw new Error("Enter a server name such as gitlab.com.");
	const token = typeof input.token === "string" ? input.token.trim() : "";
	if (!token || token.length > 4096 || /\s/.test(token)) throw new Error("Paste the token on its own, without spaces.");
	const email = typeof input.email === "string" ? input.email.trim() : "";
	if (email && (kind !== "bitbucket" || email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email))) throw new Error("Enter the email address of your Atlassian account.");
	return { kind, host, token, ...(email ? { email } : {}) };
}
