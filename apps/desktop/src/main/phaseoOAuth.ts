import type { Account } from "../shared/workspace";

/**
 * A Phaseo sign-in made by an earlier version of the app, through OAuth, and the gateway key every sign-in uses. New
 * sign-ins use the Phaseo login (phaseoLogin.ts); these keep working, renewing, until their key ends.
 */
export const PHASEO_GATEWAY_ENDPOINT = "https://api.phaseo.app/v1";
const apiRoot = "https://api.phaseo.app";

/**
 * Who an OAuth sign-in belongs to, for the sidebar's profile: OpenID userinfo for the token's account. A picture is
 * kept only as an https address, loaded by the window (which shows initials when it can't).
 */
export async function phaseoProfile(key: string, fetcher: typeof fetch = fetch, signal: AbortSignal = AbortSignal.timeout(15_000)): Promise<NonNullable<Account["profile"]>> {
	const response = await fetcher(`${apiRoot}/oauth/userinfo`, { headers: { Authorization: `Bearer ${key}` }, redirect: "error", signal });
	if (!response.ok) throw new Error(`Phaseo couldn't read this account's profile (HTTP ${response.status}).`);
	const body = await response.json() as Record<string, unknown>;
	const text = (value: unknown, max = 200) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
	const picture = text(body.picture, 2048);
	let https: string | undefined;
	try { https = picture && new URL(picture).protocol === "https:" ? picture : undefined; } catch { https = undefined; }
	const name = text(body.name), givenName = text(body.given_name), email = text(body.email);
	return { checkedAt: new Date().toISOString(), ...name ? { name } : {}, ...givenName ? { givenName } : {}, ...email ? { email } : {}, ...https ? { picture: https } : {} };
}

/**
 * Renews a Phaseo sign-in's key while the app is used, so it lasts as long as the app is used: the new
 * expiry. Undefined when this server can't renew keys yet (the key keeps its expiry); a key that can't be renewed throws.
 */
export async function renewPhaseoKey(key: string, fetcher: typeof fetch = fetch, signal: AbortSignal = AbortSignal.timeout(15_000)): Promise<string | undefined> {
	const response = await fetcher(`${apiRoot}/oauth/desktop/renew`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, redirect: "error", signal });
	if (response.status === 404 || response.status === 405) return undefined;
	if (!response.ok) throw new Error(`Phaseo couldn't renew this sign-in (HTTP ${response.status}).`);
	const body = await response.json() as { expires_at?: unknown };
	const expiresAt = typeof body.expires_at === "string" ? Date.parse(body.expires_at) : Number.NaN;
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 90 * 86_400_000) throw new Error("Phaseo returned an invalid renewal.");
	return new Date(expiresAt).toISOString();
}
