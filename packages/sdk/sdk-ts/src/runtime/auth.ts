/**
 * Returns the credential for one request: an API key, or a short-lived token
 * such as a Vercel or GitHub Actions OIDC token for a trusted workload. Called
 * before every request and retry, so it can refresh tokens; cache inside it if
 * fetching a token is expensive.
 */
export type ApiKeyProvider = () => string | Promise<string>;

/** Settles with the credential, or rejects as soon as the request's signal aborts (timeout or cancel). */
function resolveCredential(provider: ApiKeyProvider, signal?: AbortSignal | null): Promise<string> {
  if (!signal) return Promise.resolve().then(provider);
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve().then(provider).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Adds `Authorization: Bearer <credential>` from the provider unless the request already has one. */
export function withApiKeyProvider(fetchImpl: typeof fetch, provider: ApiKeyProvider): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has("authorization")) {
      const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
      const credential = String(await resolveCredential(provider, signal) ?? "").trim();
      if (!credential) throw new Error("The `apiKey` function returned an empty credential.");
      headers.set("Authorization", `Bearer ${credential}`);
    }
    return fetchImpl(input, { ...init, headers });
  }) as typeof fetch;
}
