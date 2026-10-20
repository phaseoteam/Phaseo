import type { AccountStatus } from "../../shared/workspace";
import { windowName } from "./UsageMeters";

export type UsageProvider = "codex" | "claude" | "cursor" | "grok";
/** One account whose limits we know: a login on this computer, an account added in Phaseo, or one on a hub. */
export type UsageAccount = { key: string; provider: UsageProvider; email?: string; label: string; plan?: string; source: string; status: AccountStatus };
export type PoolColumn = { account: UsageAccount; remaining: number; resetsAt: number | null };
export type PoolWindow = { id: string; label: string; remaining: number; columns: PoolColumn[]; /** The soonest reset that gives something back, and how much of the pool it restores. */ nextRefill?: { at: number; restores: number } };
export type ProviderPool = { provider: UsageProvider; windows: PoolWindow[] };

const providerOrder: UsageProvider[] = ["codex", "claude", "cursor", "grok"];

/**
 * The same account can be seen on this computer and through a hub; it counts once, keeping the first seen
 * (local logins come first).
 */
export function uniqueAccounts(accounts: UsageAccount[]) {
	const seen = new Set<string>();
	return accounts.filter(account => {
		const identity = account.email ? `${account.provider}:${account.email.toLowerCase()}` : account.key;
		if (seen.has(identity)) return false;
		seen.add(identity); return true;
	});
}

/**
 * Accounts pooled per provider, one window per kind: the provider's own windows by length (5-hour, Weekly),
 * per-model buckets by name (Opus weekly). The pool's figure is the average left across its accounts, each
 * counting equally, as T3 Code does.
 */
export function usagePools(accounts: UsageAccount[]): ProviderPool[] {
	const byProvider = new Map<UsageProvider, Map<string, PoolWindow>>();
	for (const account of uniqueAccounts(accounts)) {
		for (const bucket of account.status.usage ?? []) {
			const main = bucket.id === account.provider || !bucket.id.includes(":");
			for (const window of [bucket.primary, bucket.secondary]) {
				if (!window) continue;
				const label = main ? windowName(window.windowDurationMins, bucket.name) : bucket.name;
				const windows = byProvider.get(account.provider) ?? new Map<string, PoolWindow>();
				byProvider.set(account.provider, windows);
				const pool = windows.get(label) ?? { id: `${account.provider}:${label}`, label, remaining: 0, columns: [] };
				windows.set(label, pool);
				pool.columns.push({ account, remaining: Math.round(Math.max(0, 100 - window.usedPercent)), resetsAt: window.resetsAt });
			}
		}
	}
	const rank = (label: string) => label === "5-hour" ? 0 : label === "Daily" ? 1 : label === "Weekly" ? 2 : label.endsWith("weekly") ? 3 : 4;
	return providerOrder.filter(provider => byProvider.has(provider)).map(provider => ({
		provider,
		windows: [...byProvider.get(provider)!.values()].sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label)).map(pool => {
			const remaining = Math.round(pool.columns.reduce((sum, column) => sum + column.remaining, 0) / pool.columns.length);
			const refills = pool.columns.filter(column => column.resetsAt !== null && column.remaining < 100).sort((a, b) => a.resetsAt! - b.resetsAt!);
			const soonest = refills[0];
			return { ...pool, remaining, ...soonest ? { nextRefill: { at: soonest.resetsAt!, restores: Math.round((100 - soonest.remaining) / pool.columns.length) } } : {} };
		}),
	}));
}

/** Two initials from an email (local part and domain), or from a name. */
export function initials(text: string) {
	const [local, domain] = text.split("@");
	return ((local?.[0] ?? "") + (domain?.[0] ?? local?.[1] ?? "")).toUpperCase() || "?";
}
/** A stable hue per account, so its chip keeps the same colour everywhere. */
export function accountHue(text: string) {
	let hash = 0; for (const character of text.toLowerCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	return hash % 360;
}

export type UsageRing = { label: string; remaining: number; resetsAt: number | null };
export type RingAccount = { account: UsageAccount; inner: UsageRing | null; outer: UsageRing | null };
/**
 * A provider's two rings: the short window inside (5-hour), the long one outside (weekly). With two to
 * `maxSegments` accounts the outer ring is split into one arc per account, so a spent account shows.
 */
export type ProviderRings = { provider: UsageProvider; inner: UsageRing | null; outer: UsageRing | null; accounts: RingAccount[]; segments?: number[] };
export const maxSegments = 6;

/**
 * The sidebar's rings, one pair per provider. Readings are kept between checks, so an account whose window has
 * reset since it was read counts as full again rather than showing the old figure.
 */
export function usageRings(pools: ProviderPool[], now = Date.now()): ProviderRings[] {
	const current = (column: PoolColumn): PoolColumn => column.resetsAt !== null && column.resetsAt * 1000 <= now ? { ...column, remaining: 100, resetsAt: null } : column;
	const ring = (label: string, columns: PoolColumn[]): UsageRing | null => {
		if (!columns.length) return null;
		const remaining = Math.round(columns.reduce((sum, column) => sum + column.remaining, 0) / columns.length);
		const resets = columns.filter(column => column.resetsAt !== null && column.remaining < 100).map(column => column.resetsAt!).sort((a, b) => a - b);
		return { label, remaining, resetsAt: resets[0] ?? null };
	};
	return pools.map(pool => {
		const short = pool.windows.find(window => window.label === "5-hour") ?? pool.windows.find(window => window.label === "Daily");
		const long = pool.windows.find(window => window.label === "Weekly") ?? pool.windows.find(window => window !== short);
		const shortColumns = short?.columns.map(current) ?? [], longColumns = long?.columns.map(current) ?? [];
		const keys = [...new Set([...longColumns, ...shortColumns].map(column => column.account.key))];
		const accounts = keys.map(key => {
			const inner = shortColumns.find(column => column.account.key === key), outer = longColumns.find(column => column.account.key === key);
			return { account: (outer ?? inner)!.account, inner: inner && short ? ring(short.label, [inner]) : null, outer: outer && long ? ring(long.label, [outer]) : null };
		});
		const segments = longColumns.length > 1 && longColumns.length <= maxSegments ? longColumns.map(column => column.remaining) : undefined;
		return { provider: pool.provider, inner: short ? ring(short.label, shortColumns) : null, outer: long ? ring(long.label, longColumns) : null, accounts, ...segments ? { segments } : {} };
	}).filter(rings => rings.inner || rings.outer);
}
