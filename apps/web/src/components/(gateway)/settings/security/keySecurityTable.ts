import type { KeySecurityKey } from "@/lib/fetchers/internal/settingsTypes";
import type { TableSort } from "../../usage/SortableTableHead";

export type KeySecurityRisk = "safe_to_remove" | "no_spend_limit" | "never_expires" | "idle" | "no_ip_allowlist" | "no_storage_location";

export type KeySecurityFilter =
	| { kind: "all" }
	| { kind: KeySecurityRisk }
	| { kind: "location"; id: string };

export type KeySecuritySortKey = "name" | "owner" | "created" | "lastUsed" | "expires";

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
