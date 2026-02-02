// lib/gateway/after/http.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Response helpers for the after stage.

export function makeHeaders(timingHeader?: string) {
    const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
    });

    if (timingHeader) {
        headers.set("Server-Timing", timingHeader);
        headers.set("Timing-Allow-Origin", "*");
    }

    return headers;
}

export function createResponse(body: any, status: number, headers: Headers) {
    return new Response(JSON.stringify(body), { status, headers });
}










