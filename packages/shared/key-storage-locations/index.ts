// Key storage locations: where a workspace says it keeps an API key (a hosting
// platform's environment variables, a CI secret store, a password manager, ...).
// The answer is optional. It exists so that when one of these places reports a
// breach, a workspace (or Phaseo, for every workspace) can find and pause or
// revoke exactly the keys that were stored there.
//
// This is the one definition of the valid location ids. The gateway's key API,
// the settings API and the settings page each use a generated copy
// (scripts/sync-key-storage-locations.mjs), so validation cannot drift apart.
// Ids are stored on keys, so never rename or remove one: mark it retired
// instead. Keep this module dependency-free.

/** Most locations one key can list. Repeated by the keys_storage_locations_valid check. */
export const MAX_KEY_STORAGE_LOCATIONS = 8;

export const KEY_STORAGE_CATEGORIES = ["hosting", "cloud", "ci", "secrets", "other"] as const;
export type KeyStorageCategory = (typeof KEY_STORAGE_CATEGORIES)[number];

export type KeyStorageLocation = {
	id: string;
	name: string;
	category: KeyStorageCategory;
	/** Kept so existing keys still resolve, but no longer offered for new keys. */
	retired?: boolean;
};

export const KEY_STORAGE_LOCATIONS: readonly KeyStorageLocation[] = [
	{ id: "railway", name: "Railway", category: "hosting" },
	{ id: "vercel", name: "Vercel", category: "hosting" },
	{ id: "netlify", name: "Netlify", category: "hosting" },
	{ id: "render", name: "Render", category: "hosting" },
	{ id: "fly", name: "Fly.io", category: "hosting" },
	{ id: "heroku", name: "Heroku", category: "hosting" },
	{ id: "cloudflare", name: "Cloudflare", category: "hosting" },
	{ id: "supabase", name: "Supabase", category: "hosting" },
	{ id: "firebase", name: "Firebase", category: "hosting" },
	{ id: "digitalocean", name: "DigitalOcean", category: "hosting" },
	{ id: "replit", name: "Replit", category: "hosting" },
	{ id: "modal", name: "Modal", category: "hosting" },
	{ id: "convex", name: "Convex", category: "hosting" },
	{ id: "koyeb", name: "Koyeb", category: "hosting" },
	{ id: "coolify", name: "Coolify", category: "hosting" },
	{ id: "northflank", name: "Northflank", category: "hosting" },
	{ id: "expo", name: "Expo EAS", category: "hosting" },
	{ id: "deno-deploy", name: "Deno Deploy", category: "hosting" },
	{ id: "aws", name: "AWS", category: "cloud" },
	{ id: "google-cloud", name: "Google Cloud", category: "cloud" },
	{ id: "azure", name: "Microsoft Azure", category: "cloud" },
	{ id: "hetzner", name: "Hetzner", category: "cloud" },
	{ id: "vultr", name: "Vultr", category: "cloud" },
	{ id: "linode", name: "Akamai Linode", category: "cloud" },
	{ id: "ovhcloud", name: "OVHcloud", category: "cloud" },
	{ id: "scaleway", name: "Scaleway", category: "cloud" },
	{ id: "kubernetes", name: "Kubernetes secrets", category: "cloud" },
	{ id: "github", name: "GitHub", category: "ci" },
	{ id: "gitlab", name: "GitLab", category: "ci" },
	{ id: "circleci", name: "CircleCI", category: "ci" },
	{ id: "bitbucket", name: "Bitbucket", category: "ci" },
	{ id: "1password", name: "1Password", category: "secrets" },
	{ id: "bitwarden", name: "Bitwarden", category: "secrets" },
	{ id: "hashicorp-vault", name: "HashiCorp Vault", category: "secrets" },
	{ id: "doppler", name: "Doppler", category: "secrets" },
	{ id: "infisical", name: "Infisical", category: "secrets" },
	{ id: "local-machine", name: "My computer", category: "other" },
	{ id: "own-server", name: "My own servers", category: "other" },
	{ id: "other", name: "Somewhere else", category: "other" },
];

const LOCATIONS_BY_ID = new Map(KEY_STORAGE_LOCATIONS.map((location) => [location.id, location]));

export function keyStorageLocation(id: string): KeyStorageLocation | null {
	return LOCATIONS_BY_ID.get(id) ?? null;
}

export function isKeyStorageLocationId(value: unknown): value is string {
	return typeof value === "string" && LOCATIONS_BY_ID.has(value);
}

export type KeyStorageLocationsResult =
	| { ok: true; value: string[] }
	| { ok: false; message: string };

/**
 * Validates a submitted list of location ids: known ids only, no more than
 * MAX_KEY_STORAGE_LOCATIONS, de-duplicated and in catalogue order. Retired ids
 * are accepted only when the key already had them (`current`).
 */
export function parseKeyStorageLocations(value: unknown, current: readonly string[] = []): KeyStorageLocationsResult {
	if (value === null) return { ok: true, value: [] };
	if (!Array.isArray(value)) return { ok: false, message: "storage_locations must be an array of location ids." };
	const ids = new Set<string>();
	for (const entry of value) {
		const location = typeof entry === "string" ? LOCATIONS_BY_ID.get(entry.trim()) : undefined;
		if (!location) return { ok: false, message: `Unknown storage location: ${String(entry).slice(0, 64)}.` };
		if (location.retired && !current.includes(location.id)) return { ok: false, message: `Storage location ${location.id} is no longer offered.` };
		ids.add(location.id);
	}
	if (ids.size > MAX_KEY_STORAGE_LOCATIONS) {
		return { ok: false, message: `A key can list at most ${MAX_KEY_STORAGE_LOCATIONS} storage locations.` };
	}
	return { ok: true, value: KEY_STORAGE_LOCATIONS.filter((location) => ids.has(location.id)).map((location) => location.id) };
}
