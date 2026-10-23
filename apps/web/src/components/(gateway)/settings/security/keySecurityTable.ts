import type { KeySecurityKey } from "@/lib/fetchers/internal/settingsTypes";
import type { TableSort } from "../../usage/SortableTableHead";

export type KeySecurityRisk = "safe_to_remove" | "no_spend_limit" | "never_expires" | "idle" | "no_ip_allowlist" | "no_storage_location";

export type KeySecurityFilter =
	| { kind: "all" }
	| { kind: KeySecurityRisk }
	| { kind: "location"; id: string };

export type KeySecuritySortKey = "name" | "owner" | "created" | "lastUsed" | "expires" | "storedIn" | "status" | "risks";

/** How the key is being used, most urgent first. */
export const KEY_SECURITY_STATUSES = ["paused", "safe_to_remove", "idle", "never_used", "active"] as const;
export type KeySecurityStatus = (typeof KEY_SECURITY_STATUSES)[number];

/** Settings that make a leaked key more dangerous. Storage location has its own column. */
export type KeySecuritySettingRisk = "no_spend_limit" | "never_expires" | "no_ip_allowlist";

export function keySecurityStatus(key: KeySecurityKey): KeySecurityStatus {
	if (key.status === "paused") return "paused";
	if (key.safe_to_remove) return "safe_to_remove";
	if (key.idle) return "idle";
	if (key.never_used) return "never_used";
	return "active";
}

export function keySecurityRisks(key: KeySecurityKey): KeySecuritySettingRisk[] {
	const risks: KeySecuritySettingRisk[] = [];
	if (!key.has_spend_limit) risks.push("no_spend_limit");
	if (key.expires_at === null) risks.push("never_expires");
	if (!key.has_ip_allowlist) risks.push("no_ip_allowlist");
	return risks;
}

export function matchesKeySecurityFilter(key: KeySecurityKey, filter: KeySecurityFilter) {
	switch (filter.kind) {
		case "all": return true;
		case "no_spend_limit": return !key.has_spend_limit;
		case "never_expires": return key.expires_at === null;
		case "idle": return key.idle;
		case "safe_to_remove": return key.safe_to_remove;
		case "no_ip_allowlist": return !key.has_ip_allowlist;
		case "no_storage_location": return key.storage_locations.length === 0;
		case "location": return key.storage_locations.includes(filter.id);
	}
}

export function sameKeySecurityFilter(a: KeySecurityFilter, b: KeySecurityFilter) {
	return a.kind === b.kind && (a.kind !== "location" || a.id === (b as { id: string }).id);
}

const time = (value: string | null, missing: number) => value ? Date.parse(value) : missing;

// Never used sorts as the oldest use; never expires as the latest expiry.
const SORT_VALUE: Record<KeySecuritySortKey, (key: KeySecurityKey) => string | number> = {
	name: (key) => key.name.toLocaleLowerCase(),
	owner: (key) => (key.owner_name ?? key.owner_email ?? "").toLocaleLowerCase(),
	created: (key) => time(key.created_at, 0),
	lastUsed: (key) => time(key.last_used_at, Number.NEGATIVE_INFINITY),
	expires: (key) => time(key.expires_at, Number.POSITIVE_INFINITY),
	storedIn: (key) => [...key.storage_locations].sort().join(" "),
	// Descending puts the most urgent status and the most risks first.
	status: (key) => KEY_SECURITY_STATUSES.length - KEY_SECURITY_STATUSES.indexOf(keySecurityStatus(key)),
	risks: (key) => keySecurityRisks(key).length,
};

/** Keys in the chosen column order. Without a sort they keep the server's riskiest-first order. */
export function sortKeySecurityKeys(keys: KeySecurityKey[], sort: TableSort<KeySecuritySortKey>) {
	if (!sort) return keys;
	const value = SORT_VALUE[sort.key];
	const sign = sort.direction === "asc" ? 1 : -1;
	return [...keys].sort((a, b) => {
		const x = value(a);
		const y = value(b);
		const order = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : x === y ? 0 : x < y ? -1 : 1;
		return order * sign;
	});
}
