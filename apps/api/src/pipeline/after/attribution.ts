// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

/**
 * Extract attribution-related headers from an incoming request.
 *
 * Why:
 * - We want to log where requests are coming from (referer)
 * - We also want to capture a human-readable app title if the caller provides one
 * - This metadata is useful for analytics, logging, and attribution
 *
 * @param req - The standard Web Request object (Edge/runtime safe)
 * @returns An object containing:
 *   - referer: the URL of the referring page, if available
 *   - appTitle: a caller-provided app title (via custom header), if available
 */
export function readAttributionHeaders(req: Request) {
    // Convert the Headers object (iterable) into a plain JS object for easy access
    const headers = Object.fromEntries(req.headers);

    // "Referer" header can appear as "http-referer" (some proxies add this).
    // If neither is present, we store null.
    const referer = headers["http-referer"] ?? null;

    // Custom header: "x-title" lets an app send a human-readable name.
    // Optional: useful for showing which app made a request in logs/dashboards.
    const appTitle = headers["x-title"] ?? null;

    // Return structured attribution metadata
    return { referer, appTitle };
}

