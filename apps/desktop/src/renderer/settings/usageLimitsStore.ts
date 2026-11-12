import { useSyncExternalStore } from "react";
import type { Account, AccountStatus, Harness, WorkspaceApi } from "../../shared/workspace";
import type { ImportableHub, UsageHub, UsageHubSnapshot } from "../../shared/usageHubs";
import { errorText } from "../app/workspace";
import type { UsageAccount, UsageProvider } from "./usagePools";

export type UsageLocal = { key: string; harness: UsageProvider; accountId?: string; title: string };
export type UsageResult = AccountStatus | { error: string } | "checking";
export type UsageLimitsState = {
	statuses: Record<string, UsageResult>;
	hubs: UsageHub[];
	snapshots: Record<string, UsageHubSnapshot | "checking">;
	importableHubs: ImportableHub[];
	error: string;
	/** When every source was last asked, in ms; the sidebar's rings use it to decide when to ask again. */
	checkedAt?: number;
	/** The last finished reading of each source, shown while it is checked again so the rings don't blink out. */
	kept: { statuses: Record<string, Exclude<UsageResult, "checking">>; snapshots: Record<string, UsageHubSnapshot> };
};

const storageKey = "phaseo.desktop.usageLimits";
const listeners = new Set<() => void>();

/** The last readings survive a restart, so the rings show something before the first check finishes. */
function restore(): UsageLimitsState {
	const empty: UsageLimitsState = { statuses: {}, hubs: [], snapshots: {}, importableHubs: [], error: "", kept: { statuses: {}, snapshots: {} } };
	try {
		const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<UsageLimitsState> | null;
		return saved ? { ...empty, statuses: saved.statuses ?? {}, hubs: saved.hubs ?? [], snapshots: saved.snapshots ?? {}, kept: { statuses: (saved.statuses ?? {}) as UsageLimitsState["kept"]["statuses"], snapshots: (saved.snapshots ?? {}) as Record<string, UsageHubSnapshot> }, ...saved.checkedAt ? { checkedAt: saved.checkedAt } : {} } : empty;
	} catch { return empty; }
}
let state: UsageLimitsState = typeof window === "undefined" ? { statuses: {}, hubs: [], snapshots: {}, importableHubs: [], error: "", kept: { statuses: {}, snapshots: {} } } : restore();

function update(change: (current: UsageLimitsState) => Partial<UsageLimitsState>) {
	const next = { ...state, ...change(state) };
	// Only finished readings are kept; a check cut short by quitting starts again next time.
	const settled = <T,>(values: Record<string, T | "checking">) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "checking")) as Record<string, T>;
	const hubIds = new Set(next.hubs.map(hub => hub.id));
	state = { ...next, kept: { statuses: { ...next.kept.statuses, ...settled(next.statuses) }, snapshots: Object.fromEntries(Object.entries({ ...next.kept.snapshots, ...settled(next.snapshots) }).filter(([id]) => hubIds.has(id))) } };
	try { window.localStorage.setItem(storageKey, JSON.stringify({ statuses: state.kept.statuses, hubs: state.hubs, snapshots: state.kept.snapshots, checkedAt: state.checkedAt })); } catch { /* Readings are a convenience; storage failures leave the session as it is. */ }
	for (const listener of listeners) listener();
}

export function useUsageLimits() {
	return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state);
}

/** The logins on this computer whose limits Phaseo reads: the default Codex and Claude Code logins and native accounts added here. */
export function usageLocals(accounts: Account[]): UsageLocal[] {
	return [
		{ key: "codex", harness: "codex", title: "Codex login" },
		{ key: "claude", harness: "claude", title: "Claude Code login" },
		...accounts.filter(account => !account.archived && account.kind === "native" && (["codex", "claude", "cursor", "grok"] as Harness[]).includes(account.harness))
			.map(account => ({ key: account.id, harness: account.harness as UsageProvider, accountId: account.id, title: account.name })),
	];
}

/** Every signed-in account with readings, from this computer first, then from usage hubs. */
export function usageAccounts(locals: UsageLocal[], { hubs, kept: { statuses, snapshots } }: Pick<UsageLimitsState, "hubs" | "kept">): UsageAccount[] {
	return [
		...locals.flatMap(local => { const status = statuses[local.key]; return status && !("error" in status) && status.authenticated ? [{ key: local.key, provider: local.harness, email: status.identity, label: local.title, plan: status.plan, source: local.accountId ? "Phaseo account" : "This computer", status }] : []; }),
		...hubs.flatMap(hub => { const snapshot = snapshots[hub.id]; return snapshot ? snapshot.accounts.map(account => ({ key: `${hub.id}:${account.id}`, provider: account.provider, email: account.email, label: account.id.replace(/\.json$/, ""), plan: account.status.plan, source: hub.label, status: account.status })) : []; }),
	];
}

export const usageChecking = (value: UsageLimitsState) => Object.values(value.statuses).includes("checking") || Object.values(value.snapshots).includes("checking");

export async function checkUsageLocal(api: WorkspaceApi, local: UsageLocal) {
	update(current => ({ statuses: { ...current.statuses, [local.key]: "checking" } }));
	try { const status = await api.accountStatus(local.harness, local.accountId); update(current => ({ statuses: { ...current.statuses, [local.key]: status } })); }
	catch (reason) { update(current => ({ statuses: { ...current.statuses, [local.key]: { error: errorText(reason) } } })); }
}

export async function checkUsageHub(api: WorkspaceApi, hub: UsageHub) {
	update(current => ({ snapshots: { ...current.snapshots, [hub.id]: "checking" } }));
	try { const snapshot = await api.usageHubs({ type: "check", id: hub.id }); update(current => ({ snapshots: { ...current.snapshots, [hub.id]: snapshot } })); }
	catch (reason) { update(current => ({ snapshots: { ...current.snapshots, [hub.id]: { hubId: hub.id, checkedAt: new Date().toISOString(), accounts: [], skipped: 0, error: errorText(reason) } } })); }
}

/** Asks every source again. Each check starts an agent or calls a hub, so callers decide how often. */
export async function checkAllUsage(api: WorkspaceApi, locals: UsageLocal[]) {
	update(() => ({ checkedAt: Date.now(), error: "" }));
	for (const local of locals) void checkUsageLocal(api, local);
	try { const list = await api.usageHubs({ type: "list" }); setUsageHubs(list); for (const hub of list) void checkUsageHub(api, hub); } catch (reason) { setUsageError(errorText(reason)); }
	void api.usageHubs({ type: "importable-hubs" }).then(setImportableHubs, () => {});
}

/** Checks again only when the last full check is older than `maxAgeMs` and nothing is being checked now. */
export function refreshUsageIfStale(api: WorkspaceApi, locals: UsageLocal[], maxAgeMs: number, now = Date.now()) {
	if (usageChecking(state) || (state.checkedAt !== undefined && now - state.checkedAt < maxAgeMs)) return false;
	void checkAllUsage(api, locals);
	return true;
}

export function setUsageHubs(hubs: UsageHub[]) {
	update(current => ({ hubs, snapshots: Object.fromEntries(Object.entries(current.snapshots).filter(([id]) => hubs.some(hub => hub.id === id))) }));
}
export const setImportableHubs = (importableHubs: ImportableHub[]) => update(() => ({ importableHubs }));
export const setUsageError = (error: string) => update(() => ({ error }));
