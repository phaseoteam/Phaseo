/**
 * JWT Validation Utilities
 *
 * Provides functions for validating OAuth JWT access tokens in the API gateway.
 * Uses Web Crypto API for signature verification (compatible with Cloudflare Workers).
 *
 * Flow:
 * 1. Decode JWT header to get key ID (kid)
 * 2. Fetch JWKS (with caching) to get public key
 * 3. Verify JWT signature using public key
 * 4. Validate standard claims (exp, iat, iss, aud)
 * 5. Extract custom claims (user_id, team_id, client_id)
 */

export interface JWTClaims {
	// Standard claims
	iss: string; // Issuer (Supabase project URL)
	sub: string; // Subject (user ID)
	aud: string | string[]; // Audience
	exp: number; // Expiration time
	iat: number; // Issued at
	jti?: string; // JWT ID

	// Custom claims
	user_id: string;
	team_id: string;
	client_id: string;
	scope?: string;

	// Email (from OIDC)
	email?: string;
	email_verified?: boolean;
}

export interface JWTValidationResult {
	valid: boolean;
	claims?: JWTClaims;
	error?: string;
}

/**
 * Decode JWT without verification (for extracting header/payload)
 */
export function decodeJWT(token: string): {
	header: any;
	payload: any;
	signature: string;
} | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}

		const [headerB64, payloadB64, signature] = parts;

		// Decode header and payload (URL-safe base64)
		const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
		const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

		return { header, payload, signature };
	} catch {
		return null;
	}
}

/**
 * Check if a string looks like a JWT (3 dot-separated parts)
 */
export function isJWT(token: string): boolean {
	return token.split(".").length === 3;
}

/**
 * Validate JWT claims (exp, iat, iss, aud)
 */
export function validateClaims(
	claims: any,
	expectedIssuer: string,
	expectedAudience?: string
): { valid: boolean; error?: string } {
	const now = Math.floor(Date.now() / 1000);

	// Check expiration
	if (!claims.exp || typeof claims.exp !== "number") {
		return { valid: false, error: "Missing or invalid exp claim" };
	}
	if (claims.exp <= now) {
		return { valid: false, error: "Token has expired" };
	}

	// Check issued at
	if (!claims.iat || typeof claims.iat !== "number") {
		return { valid: false, error: "Missing or invalid iat claim" };
	}
	if (claims.iat > now + 60) {
		// Allow 60s clock skew
		return { valid: false, error: "Token issued in the future" };
	}

	// Check issuer
	if (!claims.iss || claims.iss !== expectedIssuer) {
		return { valid: false, error: "Invalid issuer" };
	}

	// Check audience (optional)
	if (expectedAudience) {
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (!audiences.includes(expectedAudience)) {
			return { valid: false, error: "Invalid audience" };
		}
	}

	// Check required custom claims
	if (!claims.user_id || typeof claims.user_id !== "string") {
		return { valid: false, error: "Missing user_id claim" };
	}
	if (!claims.team_id || typeof claims.team_id !== "string") {
		return { valid: false, error: "Missing team_id claim" };
	}
	if (!claims.client_id || typeof claims.client_id !== "string") {
		return { valid: false, error: "Missing client_id claim" };
	}

	return { valid: true };
}

/**
 * Verify JWT signature using JWKS public key
 *
 * Note: This is a simplified implementation. In production, use a proper
 * JWT library like jose that handles all edge cases.
 */
export async function verifyJWTSignature(
	token: string,
	publicKey: CryptoKey
): Promise<boolean> {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return false;
		}

		const [headerB64, payloadB64, signatureB64] = parts;

		// Reconstruct the signed data (header.payload)
		const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

		// Decode signature from URL-safe base64
		const signature = Uint8Array.from(
			atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
			(c) => c.charCodeAt(0)
		);

		// Verify signature using Web Crypto API
		const verified = await crypto.subtle.verify(
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			publicKey,
			signature,
			data
		);

		return verified;
	} catch (error) {
		console.error("Error verifying JWT signature:", error);
		return false;
	}
}

/**
 * Import public key from JWK
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
	return await crypto.subtle.importKey(
		"jwk",
		jwk,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["verify"]
	);
}

/**
 * Validate OAuth JWT token
 *
 * This is the main entry point for token validation in the API gateway.
 */
export async function validateOAuthToken(
	token: string,
	jwks: any[],
	expectedIssuer: string,
	expectedAudience?: string
): Promise<JWTValidationResult> {
	// Decode JWT to get header and payload
	const decoded = decodeJWT(token);
	if (!decoded) {
		return { valid: false, error: "Invalid JWT format" };
	}

	const { header, payload } = decoded;

	// Get key ID from header
	const kid = header.kid;
	if (!kid) {
		return { valid: false, error: "Missing kid in JWT header" };
	}

	// Find matching public key in JWKS
	const jwk = jwks.find((key) => key.kid === kid);
	if (!jwk) {
		return { valid: false, error: "Public key not found in JWKS" };
	}

	// Import public key
	let publicKey: CryptoKey;
	try {
		publicKey = await importPublicKey(jwk);
	} catch (error) {
		return { valid: false, error: "Failed to import public key" };
	}

	// Verify signature
	const signatureValid = await verifyJWTSignature(token, publicKey);
	if (!signatureValid) {
		return { valid: false, error: "Invalid signature" };
	}

	// Validate claims
	const claimsValidation = validateClaims(payload, expectedIssuer, expectedAudience);
	if (!claimsValidation.valid) {
		return { valid: false, error: claimsValidation.error };
	}

	return {
		valid: true,
		claims: payload as JWTClaims,
	};
}
