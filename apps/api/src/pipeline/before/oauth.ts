/**
 * OAuth Token Authentication Pipeline
 *
 * Validates OAuth JWT access tokens and extracts authentication context.
 * Integrates with the existing authentication pipeline to support both
 * API keys (HMAC) and OAuth tokens (JWT).
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Validate JWT signature using JWKS
 * 3. Validate claims (exp, iss, aud, custom claims)
 * 4. Check authorization not revoked in database
 * 5. Extract team context (team_id, user_id, client_id)
 * 6. Update last_used_at timestamp (async)
 *
 * Performance:
 * - JWT validation: ~5-10ms (cached JWKS)
 * - Database revocation check: ~5-10ms
 * - Total overhead: ~10-20ms vs API key auth
 */

import type { Context } from "hono";
import type { HonoBindings } from "@/runtime/types";
import { getJWKSWithCache, getJWKSWithRetry } from "@/lib/oauth/jwks";
import { validateOAuthToken, isJWT, type JWTClaims } from "@/lib/oauth/jwt";

export interface OAuthAuthResult {
	authenticated: boolean;
	userId?: string;
	teamId?: string;
	clientId?: string;
	error?: string;
	claims?: JWTClaims;
}

/**
 * Check if authorization is revoked in database
 */
async function checkAuthorizationRevoked(
	db: any, // D1 database
	userId: string,
	clientId: string,
	teamId: string
): Promise<boolean> {
	try {
		// Query oauth_authorizations table
		const stmt = db.prepare(`
			SELECT revoked_at
			FROM oauth_authorizations
			WHERE user_id = ?
			  AND client_id = ?
			  AND team_id = ?
		`);

		const result = await stmt.bind(userId, clientId, teamId).first();

		// If no authorization found, treat as revoked
		if (!result) {
			return true;
		}

		// If revoked_at is not null, authorization is revoked
		return result.revoked_at !== null;
	} catch (error) {
		console.error("Error checking authorization revocation:", error);
		// On error, fail safe and treat as revoked
		return true;
	}
}

/**
 * Update last_used_at timestamp for authorization
 * Runs asynchronously (fire and forget)
 */
function updateLastUsed(
	db: any,
	userId: string,
	clientId: string,
	teamId: string
): void {
	// Fire and forget - don't await
	const stmt = db.prepare(`
		UPDATE oauth_authorizations
		SET last_used_at = CURRENT_TIMESTAMP
		WHERE user_id = ?
		  AND client_id = ?
		  AND team_id = ?
		  AND revoked_at IS NULL
	`);

	stmt
		.bind(userId, clientId, teamId)
		.run()
		.catch((error: any) => {
			console.error("Error updating last_used_at:", error);
		});
}

/**
 * Authenticate OAuth token
 *
 * Main entry point for OAuth authentication in the pipeline.
 */
export async function authenticateOAuth(
	c: Context<{ Bindings: HonoBindings }>
): Promise<OAuthAuthResult> {
	try {
		// Extract Authorization header
		const authHeader = c.req.header("Authorization");
		if (!authHeader) {
			return { authenticated: false, error: "Missing Authorization header" };
		}

		// Check for Bearer token
		if (!authHeader.startsWith("Bearer ")) {
			return { authenticated: false, error: "Invalid Authorization header format" };
		}

		const token = authHeader.substring(7).trim();

		// Verify it's a JWT (3 dot-separated parts)
		if (!isJWT(token)) {
			return { authenticated: false, error: "Token is not a valid JWT" };
		}

		// Get Supabase URL from environment
		const supabaseUrl = c.env.SUPABASE_URL;
		if (!supabaseUrl) {
			console.error("SUPABASE_URL not configured");
			return { authenticated: false, error: "OAuth not configured" };
		}
		const supabaseBase = `${supabaseUrl}`.replace(/\/+$/, "").replace(/\/auth\/v1$/, "");
		const expectedIssuer = `${supabaseBase}/auth/v1`;

		// Get JWKS (with caching)
		let jwks = await getJWKSWithCache(supabaseUrl, c.env.KV || null);

		// Validate token
		let validation = await validateOAuthToken(
			token,
			jwks.keys,
			expectedIssuer,
			"authenticated" // Expected audience
		);

		// If validation fails due to key not found, refresh JWKS and retry
		if (!validation.valid && validation.error?.includes("Public key not found")) {
			console.log("Public key not found, refreshing JWKS...");
			jwks = await getJWKSWithRetry(supabaseUrl, c.env.KV || null, true);
			validation = await validateOAuthToken(
				token,
				jwks.keys,
				expectedIssuer,
				"authenticated"
			);
		}

		if (!validation.valid || !validation.claims) {
			return {
				authenticated: false,
				error: validation.error || "Invalid token",
			};
		}

		const claims = validation.claims;

		// Check if authorization is revoked
		const isRevoked = await checkAuthorizationRevoked(
			c.env.DB,
			claims.user_id,
			claims.client_id,
			claims.team_id
		);

		if (isRevoked) {
			return {
				authenticated: false,
				error: "Authorization has been revoked",
			};
		}

		// Update last_used_at (async, don't await)
		updateLastUsed(c.env.DB, claims.user_id, claims.client_id, claims.team_id);

		return {
			authenticated: true,
			userId: claims.user_id,
			teamId: claims.team_id,
			clientId: claims.client_id,
			claims: claims,
		};
	} catch (error: any) {
		console.error("OAuth authentication error:", error);
		return {
			authenticated: false,
			error: error.message || "Authentication failed",
		};
	}
}

/**
 * Determine if request is using OAuth vs API key
 *
 * Used by authentication pipeline to route to correct auth method.
 */
export function isOAuthRequest(authHeader: string | undefined): boolean {
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return false;
	}

	const token = authHeader.substring(7).trim();
	return isJWT(token);
}
