/**
 * Returns the credential for one request: an API key, or a short-lived token
 * such as a Vercel or GitHub Actions OIDC token for a trusted workload. Called
 * before every request and retry, so it can refresh tokens; cache inside it if
 * fetching a token is expensive.
 */
export type ApiKeyProvider = () => string | Promise<string>;

/** Adds `Authorization: Bearer <credential>` from the provider unless the request already has one. */
export function withApiKeyProvider(fetchImpl: typeof fetch, provider: ApiKeyProvider): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has("authorization")) {
      const credential = String(await provider() ?? "").trim();
      if (!credential) throw new Error("The `apiKey` function returned an empty credential.");
      headers.set("Authorization", `Bearer ${credential}`);
    }
    return fetchImpl(input, { ...init, headers });
  }) as typeof fetch;
}
