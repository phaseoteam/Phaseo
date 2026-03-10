// src/lib/http/sanitize-headers.ts
// Purpose: HTTP utilities for consistent headers/sanitization.
// Why: Keeps security and compatibility handling in one place.
// How: Removes hop-by-hop headers from upstream responses.

/**
 * Rebuild a Request with security-hardened headers.
 * Removes hop-by-hop and sensitive headers while preserving method, body and cf metadata.
 */
const DENY = new Set([
    "authorization",
    "cookie",
    "set-cookie",
    "proxy-authorization",
    "proxy-connection",
    "forwarded",
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "cf-ray",
    "cf-worker",
]);

type SanitizeOptions = {
    preserve?: string[];
};

export function sanitizeRequestHeaders(req: Request, opts: SanitizeOptions = {}): Request {
    const preserve = new Set((opts.preserve ?? []).map((h) => h.toLowerCase()));
    const headers = new Headers();
    req.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (preserve.has(lower) || !DENY.has(lower)) headers.append(key, value);
    });

    const bodyAllowed = !["GET", "HEAD"].includes(req.method.toUpperCase());
    const init: any = {
        method: req.method,
        headers,
        redirect: req.redirect,
        cf: (req as any).cf,
    };
    if (bodyAllowed && req.body) {
        init.body = req.body;
        // Node/Undici requires `duplex` when forwarding stream bodies.
        init.duplex = "half";
    }
    return new Request(req.url, init);
}










