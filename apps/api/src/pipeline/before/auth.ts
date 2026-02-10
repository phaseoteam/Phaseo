// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import { getBindings, getSupabaseAdmin, dispatchBackground, configureRuntime, clearRuntime, getCache } from "@/runtime/env";
import { keyVersionToken } from "@/core/kv";

const enc = new TextEncoder();
const KEY_CACHE_PREFIX = "gateway:key";
const KEY_CACHE_TTL_SECONDS = 60;
const KEY_CACHE_TTL_NEGATIVE_SECONDS = 60;

/* -------------------- Web Crypto HMAC helpers -------------------- */

/**
 * Compute HMAC-SHA256 of `message` using a raw key (as bytes).
 * Returns the result as a lowercase hex string.
 *
 * Why:
 * - We need to validate API keys without storing secrets in plaintext.
 * - HMAC + pepper lets us safely verify user-provided secrets.
 */
async function hmacHexWithKeyBytes(message: string, keyBytes: Uint8Array): Promise<string> {
    // Ensure we have a real ArrayBuffer (avoid SharedArrayBuffer quirks).
    const raw = new Uint8Array(keyBytes.byteLength);
    raw.set(keyBytes);

    // Import the raw bytes into a WebCrypto HMAC key.
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        raw.buffer,                         // must be an ArrayBuffer
        { name: "HMAC", hash: "SHA-256" }, // HMAC-SHA256
        false,                              // not extractable
        ["sign"]                            // only used for signing
    );

    // Compute the MAC (message authentication code).
    const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));

    // Convert binary result into hex string.
    const u8 = new Uint8Array(mac);
    let hex = "";
    for (let i = 0; i < u8.length; i++) hex += u8[i].toString(16).padStart(2, "0");
    return hex;
}

/**
 * Convenience wrapper: compute HMAC using a UTF-8 string key.
 * This is the "Node-compatible" mode (mirrors createHmac).
 */
function hmacUtf8(message: string, pepperUtf8: string) {
    return hmacHexWithKeyBytes(message, enc.encode(pepperUtf8));
}

// Optional decoders: allow peppers stored as hex or base64url.
// Not used by default (UTF-8 pepper is the standard path).
function decodeHex(s: string): Uint8Array | null {
    if (!/^[0-9a-fA-F]+$/.test(s) || s.length % 2 !== 0) return null;
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
}
function decodeBase64Url(s: string): Uint8Array | null {
    try {
        const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch { return null; }
}

/**
 * Constant-time comparison of two hex strings.
 * Prevents timing attacks that could leak partial info.
 */
function ctEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/* -------------------- token parsing -------------------- */

/**
 * Parse an API key string in format:
 *   aistats_v1_sk_<kid>_<secret>
 *
 * - aistats = project namespace
 * - v1      = version
 * - k       = key indicator
 * - kid     = key ID (public reference)
 * - secret  = user-held secret part
 */
function parseV2(token: string) {
    if (!token.startsWith("aistats_")) return null;
    const parts = token.split("_");
    if (parts.length < 5) return null;

    const [_, v, kTag, kid, ...rest] = parts;
    if (v !== "v1" || kTag !== "sk") return null;

    const secret = rest.join("_"); // allow underscores inside secret
    if (!kid || !secret) return null;

    return { kid, secret };
}

/* -------------------- main -------------------- */

export type AuthFailure = { ok: false; reason: string };
export type AuthSuccess = {
    ok: true;
    teamId: string;
    apiKeyId: string;
    apiKeyRef: string;
    apiKeyKid: string;
    internal?: boolean;
};

type KeyRow = {
    id: string;
    team_id: string;
    status: string;
    hash: string;
};

async function getCachedKey(kid: string): Promise<KeyRow | null> {
    const versionToken = await keyVersionToken("kid", kid);
    const cached = await getCache().get(`${KEY_CACHE_PREFIX}:${kid}:${versionToken}`, "json");
    if (!cached || typeof cached !== "object") return null;
    const row = cached as Partial<KeyRow>;
    if (!row.id || !row.team_id || !row.status || !row.hash) return null;
    return row as KeyRow;
}

async function cacheKey(kid: string, row: KeyRow) {
    const versionToken = await keyVersionToken("kid", kid);
    await getCache().put(`${KEY_CACHE_PREFIX}:${kid}:${versionToken}`, JSON.stringify(row), {
        expirationTtl: KEY_CACHE_TTL_SECONDS,
    });
}

async function cacheNegativeKey(kid: string) {
    const versionToken = await keyVersionToken("kid", kid);
    await getCache().put(`${KEY_CACHE_PREFIX}:${kid}:${versionToken}`, JSON.stringify({ missing: true }), {
        expirationTtl: KEY_CACHE_TTL_NEGATIVE_SECONDS,
    });
}

/**
 * Authenticate an incoming request using an Authorization: Bearer header.
 *
 * Supports both:
 * - API Keys: aistats_v1_sk_{kid}_{secret} (HMAC validation)
 * - OAuth JWT: Bearer {jwt_token} (JWT signature validation)
 *
 * Steps:
 *  1. Parse and validate the token format.
 *  2a. If JWT: Validate signature, claims, and check revocation
 *  2b. If API Key: Look up key metadata (id, team_id, status, stored hash) in Supabase.
 *  3. Compute HMAC(secret + pepper) and compare against stored hash (API key only).
 *  4. On success, update last_used_at and return team + key reference.
 *
 * @param authorizationHeader - Raw "Authorization" header string
 */
export async function authenticate(req: Request): Promise<AuthSuccess | AuthFailure> {
    // 1. Ensure proper "Bearer ..." format.
    const authorizationHeader = req.headers.get("authorization") ?? undefined;
    if (!authorizationHeader?.startsWith("Bearer ")) {
        return { ok: false, reason: "missing_or_invalid_authorization_header" };
    }
    const token = authorizationHeader.slice(7).trim();

    // 2. Route to OAuth or API key authentication
    // Check if token is a JWT (3 dot-separated parts, not starting with aistats_)
    if (isJWTFormat(token)) {
        if (!isGatewayOAuthJwt(token)) {
            return { ok: false, reason: "invalid_key_format" };
        }
        return await authenticateOAuth(token);
    }

    const bindings = getBindings();

    // 2. Parse structured token.
    const parsed = parseV2(token);
    if (!parsed) return { ok: false, reason: "invalid_key_format" };

    // 3. Look up key in Supabase.
    const supabase = getSupabaseAdmin();
    let keyRow = await getCachedKey(parsed.kid);
    if (!keyRow) {
        const { data, error } = await supabase
            .from("keys")
            .select("id, team_id, status, hash")
            .eq("kid", parsed.kid)
            .maybeSingle();

        if (error) return { ok: false, reason: "db_error" };
        if (!data) {
            await cacheNegativeKey(parsed.kid);
            return { ok: false, reason: "key_not_found_or_revoked" };
        }
        keyRow = data as KeyRow;
        await cacheKey(parsed.kid, keyRow);
    }

    if (!keyRow || keyRow.status !== "active") {
        return { ok: false, reason: "key_not_found_or_revoked" };
    }

    const stored = String(keyRow.hash).toLowerCase().trim();
    const pepper = (bindings.KEY_PEPPER ?? "").trim();
    if (!pepper) return { ok: false, reason: "server_misconfig_missing_pepper" };

    const success = async (): Promise<AuthSuccess | AuthFailure> => {
        let teamId = keyRow.team_id;
        let internal = false;

        // Fire-and-forget update of last_used_at timestamp.
        dispatchBackground((async () => {
            configureRuntime(bindings);
            try {
                await supabase
                    .from("keys")
                    .update({ last_used_at: new Date().toISOString() })
                    .eq("id", keyRow.id);
            } finally {
                clearRuntime();
            }
        })());

        return {
            ok: true,
            apiKeyId: keyRow.id,
            apiKeyRef: `kid_${parsed.kid}`,
            apiKeyKid: parsed.kid,
            teamId,
            internal,
        } as AuthSuccess;
    };

    // 4a. Normal path: UTF-8 pepper (Node-compatible).
    const digestUtf8 = await hmacUtf8(parsed.secret, pepper);
    if (ctEqualHex(digestUtf8, stored)) {
        return success();
    }

    // 4b. Optional fallback paths (only if you later migrate pepper encoding).
    const hex = decodeHex(pepper);
    if (hex) {
        const d = await hmacHexWithKeyBytes(parsed.secret, hex);
        if (ctEqualHex(d, stored)) {
            return success();
        }
    }
    const b64 = decodeBase64Url(pepper);
    if (b64) {
        const d = await hmacHexWithKeyBytes(parsed.secret, b64);
        if (ctEqualHex(d, stored)) {
            return success();
        }
    }

    // 5. If all checks fail - reject.
    return { ok: false, reason: "invalid_secret" };
}

/* -------------------- OAuth JWT Authentication -------------------- */

/**
 * Authenticate using OAuth JWT token
 *
 * This is called when the Authorization header contains a JWT token
 * (Bearer token with 3 dot-separated parts) instead of an API key.
 */
async function authenticateOAuth(token: string): Promise<AuthSuccess | AuthFailure> {
    const bindings = getBindings();

    // Check if SUPABASE_URL is configured
    const supabaseUrl = bindings.SUPABASE_URL;
    if (!supabaseUrl) {
        console.error("SUPABASE_URL not configured for OAuth");
        return { ok: false, reason: "oauth_not_configured" };
    }
    const supabaseBase = `${supabaseUrl}`.replace(/\/+$/, "").replace(/\/auth\/v1$/, "");
    const expectedIssuer = `${supabaseBase}/auth/v1`;

    try {
        // Import OAuth utilities dynamically to avoid circular dependencies
        const { getJWKSWithCache, getJWKSWithRetry } = await import("@/lib/oauth/jwks");
        const { validateOAuthToken, isJWT } = await import("@/lib/oauth/jwt");

        // Verify it's actually a JWT
        if (!isJWT(token)) {
            return { ok: false, reason: "invalid_jwt_format" };
        }

        // Get JWKS (with caching via KV)
        let jwks = await getJWKSWithCache(supabaseUrl, bindings.KV || null);

        // Validate token
        let validation = await validateOAuthToken(
            token,
            jwks.keys,
            expectedIssuer,
            "authenticated" // Expected audience
        );

        // If validation fails due to key not found, refresh JWKS and retry
        if (!validation.valid && validation.error?.includes("Public key not found")) {
            jwks = await getJWKSWithRetry(supabaseUrl, bindings.KV || null, true);
            validation = await validateOAuthToken(
                token,
                jwks.keys,
                expectedIssuer,
                "authenticated"
            );
        }

        if (!validation.valid || !validation.claims) {
            return {
                ok: false,
                reason: validation.error || "invalid_oauth_token",
            };
        }

        const claims = validation.claims;

        // Check if authorization is revoked in database
        const supabase = getSupabaseAdmin();
        const { data: authorization, error: authError } = await supabase
            .from("oauth_authorizations")
            .select("revoked_at")
            .eq("user_id", claims.user_id)
            .eq("client_id", claims.client_id)
            .eq("team_id", claims.team_id)
            .maybeSingle();

        if (authError) {
            console.error("Error checking OAuth authorization:", authError);
            return { ok: false, reason: "oauth_db_error" };
        }

        // If no authorization found or it's revoked, reject
        if (!authorization || authorization.revoked_at !== null) {
            return { ok: false, reason: "oauth_authorization_revoked" };
        }

        // Update last_used_at (fire and forget)
        dispatchBackground((async () => {
            configureRuntime(bindings);
            try {
                await supabase
                    .from("oauth_authorizations")
                    .update({ last_used_at: new Date().toISOString() })
                    .eq("user_id", claims.user_id)
                    .eq("client_id", claims.client_id)
                    .eq("team_id", claims.team_id);
            } catch (error) {
                console.error("Error updating OAuth last_used_at:", error);
            } finally {
                clearRuntime();
            }
        })());

        // Return success with OAuth-specific context
        return {
            ok: true,
            teamId: claims.team_id,
            apiKeyId: claims.client_id, // Use client_id as key reference for OAuth
            apiKeyRef: `oauth_${claims.client_id}`,
            apiKeyKid: claims.client_id,
            internal: false,
        } as AuthSuccess;
    } catch (error: any) {
        const message = String(error?.message ?? "");
        if (message.includes("JWKS")) {
            return { ok: false, reason: "oauth_jwks_unavailable" };
        }
        console.error("OAuth authentication error:", message);
        return { ok: false, reason: "oauth_authentication_failed" };
    }
}

/**
 * Check if token looks like a JWT (3 dot-separated parts)
 */
function isJWTFormat(token: string): boolean {
    return token.split(".").length === 3 && !token.startsWith("aistats_");
}

function tryDecodeJwtPayload(token: string): Record<string, any> | null {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const payload = parts[1];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed as Record<string, any>;
    } catch {
        return null;
    }
}

function isGatewayOAuthJwt(token: string): boolean {
    const payload = tryDecodeJwtPayload(token);
    if (!payload) return false;
    return (
        typeof payload.user_id === "string" &&
        typeof payload.team_id === "string" &&
        typeof payload.client_id === "string"
    );
}


