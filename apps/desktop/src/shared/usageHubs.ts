import type { AccountStatus } from "./workspace";

/** A CLIProxyAPI hub whose accounts' limits Phaseo reads. Its management key stays in secure storage. */
export type UsageHub = { id: string; label: string; url: string; createdAt: string };
export type UsageHubAccount = { id: string; provider: "codex" | "claude"; email?: string; status: AccountStatus };
export type UsageHubSnapshot = { hubId: string; checkedAt: string; accounts: UsageHubAccount[]; /** Accounts on the hub for providers Phaseo can't read limits for. */ skipped: number; error?: string };

export type UsageHubRequest =
	| { type: "list" }
	| { type: "add"; url: string; key: string; label?: string }
	| { type: "remove"; id: string }
	| { type: "check"; id: string };

export function validateUsageHubRequest(value: unknown): UsageHubRequest {
	if (!value || typeof value !== "object") throw new Error("Invalid usage hub request.");
	const request = value as Record<string, unknown>;
	const text = (field: string, max: number, optional = false) => {
		const entry = request[field];
		if (entry === undefined && optional) return undefined;
		if (typeof entry !== "string" || !entry.trim() || entry.length > max) throw new Error(`Invalid usage hub ${field}.`);
		return entry.trim();
	};
	if (request.type === "list") return { type: "list" };
	if (request.type === "add") return { type: "add", url: text("url", 2000)!, key: text("key", 4000)!, ...request.label === undefined || request.label === "" ? {} : { label: text("label", 80, true) } };
	if (request.type === "remove" || request.type === "check") return { type: request.type, id: text("id", 100)! };
	throw new Error("Invalid usage hub request.");
}
