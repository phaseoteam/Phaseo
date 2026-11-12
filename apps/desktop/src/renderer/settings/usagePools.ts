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
 * (local logins come first) among those that report limits. A login without limits (a Console sign-in) never hides
 * a hub's reading of the same email.
 */
export function uniqueAccounts(accounts: UsageAccount[]) {
	const identity = (account: UsageAccount) => account.email ? `${account.provider}:${account.email.toLowerCase()}` : account.key;
	const limited = new Set(accounts.filter(account => account.status.usage?.length).map(identity));
	const seen = new Set<string>();
	return accounts.filter(account => {
		const key = identity(account);
		if (seen.has(key) || (limited.has(key) && !account.status.usage?.length)) return false;
		seen.add(key); return true;
	});
}

/**
 * Accounts pooled per provider, one window per kind: the provider's own windows by length (5-hour, Weekly),
 * per-model buckets by name (Opus weekly). The pool's figure is the average left across its accounts, each
 * counting equally.
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
 * A pair of rings: the short window inside (5-hour), the long one outside (weekly). With two to `maxSegments`
 * accounts the outer ring is split into one arc per account, so a spent account shows. When a provider's accounts are
 * on different plans, each plan gets its own pair, named by `tier`.
 */
export type ProviderRings = { key: string; provider: UsageProvider; tier?: string; inner: UsageRing | null; outer: UsageRing | null; accounts: RingAccount[]; segments?: number[] };
export const maxSegments = 6;
/** Per-model buckets are named after their model ("Fable weekly"); the plan's own windows aren't. */
const perModel = (window: PoolWindow) => window.label.endsWith(" weekly");

/**
 * The sidebar's rings. Readings are kept between checks, so an account whose window has reset since it was read
 * counts as full again rather than showing the old figure.
 */
export function usageRings(pools: ProviderPool[], now = Date.now()): ProviderRings[] {
	const current = (column: PoolColumn): PoolColumn => column.resetsAt !== null && column.resetsAt * 1000 <= now ? { ...column, remaining: 100, resetsAt: null } : column;
	const ring = (label: string, columns: PoolColumn[]): UsageRing | null => {
		if (!columns.length) return null;
		const remaining = Math.round(columns.reduce((sum, column) => sum + column.remaining, 0) / columns.length);
		const resets = columns.filter(column => column.resetsAt !== null && column.remaining < 100).map(column => column.resetsAt!).sort((a, b) => a - b);
		return { label, remaining, resetsAt: resets[0] ?? null };
	};
	const pair = (provider: UsageProvider, all: PoolWindow[], tier?: string): ProviderRings => {
		const windows = all.map(window => ({ ...window, columns: window.columns.map(current) })).filter(window => window.columns.length);
		const own = windows.filter(window => !perModel(window));
		const fiveHour = own.find(window => window.label === "5-hour") ?? own.find(window => window.label === "Daily");
		// Without a plan-wide weekly window, the tightest per-model one (Fable weekly) is the week's limit.
		const tightest = windows.filter(perModel).map(window => ({ window, left: ring(window.label, window.columns)!.remaining })).sort((a, b) => a.left - b.left)[0]?.window;
		const weekly = own.find(window => window.label === "Weekly") ?? own.find(window => window !== fiveHour) ?? tightest;
		// A plan with one window draws it as the outer ring, so its per-account arcs still show.
		const [short, long] = weekly ? [fiveHour, weekly] : [undefined, fiveHour];
		const shortColumns = short?.columns ?? [], longColumns = long?.columns ?? [];
		const keys = [...new Set([...longColumns, ...shortColumns].map(column => column.account.key))];
		const accounts = keys.map(key => {
			const inner = shortColumns.find(column => column.account.key === key), outer = longColumns.find(column => column.account.key === key);
			return { account: (outer ?? inner)!.account, inner: inner && short ? ring(short.label, [inner]) : null, outer: outer && long ? ring(long.label, [outer]) : null };
		});
		const segments = longColumns.length > 1 && longColumns.length <= maxSegments ? longColumns.map(column => column.remaining) : undefined;
		return { key: tier === undefined ? provider : `${provider}:${tier}`, provider, ...tier ? { tier } : {}, inner: short ? ring(short.label, shortColumns) : null, outer: long ? ring(long.label, longColumns) : null, accounts, ...segments ? { segments } : {} };
	};
	return pools.flatMap(pool => {
		// Plans differ in size (a premium seat holds several times a standard one), so averaging across them would mislead.
		const plans = [...new Set(pool.windows.flatMap(window => window.columns.map(column => column.account.plan ?? "")))];
		if (plans.length < 2) return [pair(pool.provider, pool.windows)];
		return plans.map(plan => pair(pool.provider, pool.windows.map(window => ({ ...window, columns: window.columns.filter(column => (column.account.plan ?? "") === plan) })), plan));
	}).filter(rings => rings.inner || rings.outer);
}

/** A short name for a plan beside its rings: its multiplier (Max 5x, Team premium 5x), "Std" for a standard seat, otherwise the plan's last word. */
export function tierTag(plan: string) {
	const multiplier = plan.match(/\b\d+x\b/)?.[0];
	if (multiplier) return multiplier;
	if (/\bstandard$/i.test(plan)) return "Std";
	const word = plan.trim().split(/\s+/).at(-1) ?? plan;
	return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A pair is running low when either pooled figure is at or below this; one spent account in a pool isn't enough. */
export const lowAt = 25;
const tightest = (pair: ProviderRings) => Math.min(pair.inner?.remaining ?? 100, pair.outer?.remaining ?? 100);

/**
 * The order pairs are shown in: running low first, then what is in use (the open chat, running tasks), then pinned,
 * then the tightest. Ties keep the providers' usual order.
 */
export function rankRings(rings: ProviderRings[], { inUse, pinned }: { inUse: ReadonlySet<UsageProvider>; pinned: ReadonlySet<string> }) {
	const score = (pair: ProviderRings) => [tightest(pair) <= lowAt ? 0 : 1, inUse.has(pair.provider) ? 0 : 1, pinned.has(pair.key) ? 0 : 1, tightest(pair)];
	return rings.map((pair, index) => ({ pair, index, score: score(pair) }))
		.sort((a, b) => a.score.reduce((order, value, at) => order || value - b.score[at], 0) || a.index - b.index)
		.map(({ pair }) => pair);
}

/** Sidebar room for rings, in px as measured: a logo and ring, each letter of a tag and its gap, between pairs, the "+N" count. */
const ringRoom = { width: 218, pair: 40, tagLetter: 6, tagGap: 4, gap: 10, more: 24, max: 3 };
export type SidebarRing = { pair: ProviderRings; tag?: string };
/**
 * What the sidebar row shows of the ranked pairs: all of them when they fit, otherwise as many as fit beside a "+N"
 * count, at most three, so the row stays the same size however many subscriptions there are. A pair carries its tier
 * tag only when another shown pair has the same logo; otherwise the logo is enough and the popover names the plan.
 */
export function sidebarRings(ranked: ProviderRings[]): { shown: SidebarRing[]; hidden: number } {
	const layout = (count: number) => {
		const pairs = ranked.slice(0, count);
		const shown = pairs.map(pair => pair.tier && pairs.some(other => other !== pair && other.provider === pair.provider) ? { pair, tag: tierTag(pair.tier) } : { pair });
		const width = shown.reduce((sum, { tag }, index) => sum + ringRoom.pair + (tag ? ringRoom.tagGap + tag.length * ringRoom.tagLetter : 0) + (index ? ringRoom.gap : 0), 0);
		return { shown, width: width + (count < ranked.length ? ringRoom.gap + ringRoom.more : 0) };
	};
	const all = layout(ranked.length);
	if (all.width <= ringRoom.width) return { shown: all.shown, hidden: 0 };
	for (let count = Math.min(ringRoom.max, ranked.length); count > 1; count--) {
		const fitted = layout(count);
		if (fitted.width <= ringRoom.width) return { shown: fitted.shown, hidden: ranked.length - count };
	}
	return { shown: layout(1).shown, hidden: ranked.length - 1 };
}
