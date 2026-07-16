const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function requestUrl(input: Parameters<typeof fetch>[0]): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
}

export function installLoopbackOnlyFetchGuard(): () => void {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(requestUrl(input));
        if (!LOOPBACK_HOSTS.has(url.hostname)) {
            throw new Error(`test_network_guard_blocked_external_request:${url.href}`);
        }
        return originalFetch(input, init);
    }) as typeof fetch;
    return () => {
        globalThis.fetch = originalFetch;
    };
}
