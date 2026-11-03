"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { ssoClient } from "@better-auth/sso/client";
import { adminClient, inferAdditionalFields, jwtClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { PhaseoAuth } from "./server";

/**
 * The browser client for /api/auth, with the same plugins as server.ts (bearer and nextCookies are server-only).
 *
 * When a password sign-in needs a TOTP code, Better Auth answers `twoFactorRedirect: true` and the client calls
 * `onTwoFactorRedirect`; it goes to the existing /auth/verify-mfa page, keeping a same-site returnUrl. Social,
 * passkey and SSO sign-ins don't trigger it: the proxy sends those sessions to /auth/verify-mfa (aal.ts).
 */
export const TWO_FACTOR_RETURN_URL_KEY = "phaseo.auth.twoFactorReturnUrl";

function goToVerifyMfa() {
	let returnUrl: string | null = null;
	try {
		returnUrl = window.sessionStorage.getItem(TWO_FACTOR_RETURN_URL_KEY);
		window.sessionStorage.removeItem(TWO_FACTOR_RETURN_URL_KEY);
	} catch {
		returnUrl = null;
	}
	const target = new URL("/auth/verify-mfa", window.location.origin);
	if (returnUrl?.startsWith("/") && !returnUrl.startsWith("//")) target.searchParams.set("returnUrl", returnUrl);
	window.location.assign(`${target.pathname}${target.search}`);
}

export const authClient = createAuthClient({
	// Same origin as the page: production, the preview host or localhost.
	basePath: "/api/auth",
	plugins: [
		inferAdditionalFields<PhaseoAuth>(),
		adminClient(),
		jwtClient(),
		twoFactorClient({ onTwoFactorRedirect: goToVerifyMfa }),
		passkeyClient(),
		ssoClient(),
	],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
