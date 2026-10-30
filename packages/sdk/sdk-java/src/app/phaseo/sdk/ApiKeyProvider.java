package app.phaseo.sdk;

/**
 * Returns the credential for one request: an API key, or a short-lived token such as a
 * GitHub Actions or Vercel OIDC token for a trusted workload. Phaseo calls it before every
 * request and retry, so it can refresh tokens; cache inside it if fetching a token is
 * expensive. {@link WorkloadTokens} has ready-made providers.
 */
@FunctionalInterface
public interface ApiKeyProvider {
	String get() throws Exception;
}
