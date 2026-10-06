export interface OAuthRedirectRegistration {
	client_id: string;
	redirect_uris: string[];
	is_first_party?: boolean;
	registration_source?: string;
}

/** A registered native callback may change its port, never its host or path. */
export function isRegisteredOAuthRedirectAllowed(client: OAuthRedirectRegistration, redirectUri: string): boolean {
	if (client.redirect_uris.includes(redirectUri)) return true;
	if (client.client_id !== "phaseo_desktop" || !client.is_first_party || client.registration_source !== "first_party" || !client.redirect_uris.includes("http://127.0.0.1/callback")) return false;
	try {
		const url = new URL(redirectUri);
		return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.pathname === "/callback" && !url.username && !url.password && !url.search && !url.hash;
	} catch {
		return false;
	}
}
