using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace PhaseoSdk
{
    // Adds `Authorization: Bearer <credential>` from a credential provider to every outgoing request,
    // including each retry, unless the request already carries an Authorization header.
    // The generated client builds a new request per attempt, so wrapping its transport is enough.
    internal sealed class CredentialProviderHandler : HttpMessageHandler
    {
        private readonly Func<CancellationToken, ValueTask<string>> _provider;
        private readonly HttpMessageInvoker _inner;
        private readonly bool _ownsInner;

        internal CredentialProviderHandler(Func<CancellationToken, ValueTask<string>> provider, HttpMessageInvoker inner, bool ownsInner)
        {
            _provider = provider;
            _inner = inner;
            _ownsInner = ownsInner;
        }

        // Wraps a caller-supplied HttpClient, or a new handler when there is none, so the provider runs per attempt.
        internal static HttpClient CreateHttpClient(Func<CancellationToken, ValueTask<string>> provider, HttpClient? httpClient)
        {
            if (httpClient is null)
            {
                return new HttpClient(new CredentialProviderHandler(provider, new HttpMessageInvoker(new HttpClientHandler()), ownsInner: true));
            }

            return new HttpClient(new CredentialProviderHandler(provider, httpClient, ownsInner: false))
            {
                Timeout = httpClient.Timeout,
                MaxResponseContentBufferSize = httpClient.MaxResponseContentBufferSize
            };
        }

        internal static async ValueTask<string> ResolveAsync(Func<CancellationToken, ValueTask<string>> provider, CancellationToken cancellationToken)
        {
            var credential = (await provider(cancellationToken).ConfigureAwait(false))?.Trim();
            if (string.IsNullOrEmpty(credential))
            {
                throw new InvalidOperationException("The API key provider returned an empty credential.");
            }

            return credential;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (!request.Headers.Contains("Authorization"))
            {
                var credential = await ResolveAsync(_provider, cancellationToken).ConfigureAwait(false);
                request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + credential);
            }

            if (_inner is HttpClient client)
            {
                // HttpClient refuses a request message that another HttpClient already sent, so forward a copy.
                // The outer client buffers the body itself when the caller asked for it.
                var forwarded = new HttpRequestMessage(request.Method, request.RequestUri)
                {
                    Content = request.Content,
                    Version = request.Version,
                    VersionPolicy = request.VersionPolicy
                };
                foreach (var header in request.Headers)
                {
                    forwarded.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }

                var options = (IDictionary<string, object?>)forwarded.Options;
                foreach (var option in request.Options)
                {
                    options[option.Key] = option.Value;
                }

                return await client.SendAsync(forwarded, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            }

            return await _inner.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && _ownsInner)
            {
                _inner.Dispose();
            }

            base.Dispose(disposing);
        }
    }

    /// <summary>
    /// Credential providers for trusted workloads (beta): GitHub Actions jobs and Vercel deployments call
    /// Phaseo with a short-lived OIDC token instead of an API key. Pass the result as the <c>apiKeyProvider</c>
    /// of <see cref="Phaseo"/>. Tokens are cached until 60 seconds before they expire.
    /// </summary>
    public static class WorkloadTokens
    {
        /// <summary>The audience Phaseo accepts for trusted workload tokens.</summary>
        public const string DefaultAudience = "https://api.phaseo.app";

        /// <summary>Vercel's OIDC token exchange endpoint.</summary>
        public const string VercelExchangeUrl = "https://oidc.vercel.com/~token";

        private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);
        private static readonly TimeSpan RefreshBeforeExpiry = TimeSpan.FromSeconds(60);
        private static readonly Lazy<HttpClient> SharedHttpClient = new(() => new HttpClient());

        /// <summary>
        /// Returns a provider that fetches a GitHub Actions OIDC token for <paramref name="audience"/>.
        /// The job needs <c>permissions: id-token: write</c>.
        /// </summary>
        /// <param name="audience">Token audience. Defaults to <see cref="DefaultAudience"/>.</param>
        /// <param name="httpClient">HttpClient used to call the token endpoint. Defaults to a shared client.</param>
        /// <param name="environment">Environment variable lookup. Defaults to <see cref="Environment.GetEnvironmentVariable(string)"/>.</param>
        /// <param name="timeProvider">Clock used for token expiry. Defaults to <see cref="TimeProvider.System"/>.</param>
        public static Func<CancellationToken, ValueTask<string>> GitHubActions(
            string audience = DefaultAudience,
            HttpClient? httpClient = null,
            Func<string, string?>? environment = null,
            TimeProvider? timeProvider = null)
        {
            var env = environment ?? Environment.GetEnvironmentVariable;
            var clock = timeProvider ?? TimeProvider.System;
            var gate = new SemaphoreSlim(1, 1);
            string? cachedToken = null;
            var cachedUntil = DateTimeOffset.MinValue;

            return async cancellationToken =>
            {
                await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
                    if (cachedToken is not null && clock.GetUtcNow() < cachedUntil)
                    {
                        return cachedToken;
                    }

                    var requestUrl = env("ACTIONS_ID_TOKEN_REQUEST_URL");
                    var requestToken = env("ACTIONS_ID_TOKEN_REQUEST_TOKEN");
                    if (string.IsNullOrWhiteSpace(requestUrl) || string.IsNullOrWhiteSpace(requestToken))
                    {
                        throw new InvalidOperationException(
                            "GitHub Actions OIDC token is unavailable: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set. " +
                            "Give the job `permissions: id-token: write`.");
                    }

                    var separator = requestUrl.Contains('?') ? "&" : "?";
                    using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl + separator + "audience=" + Uri.EscapeDataString(audience));
                    request.Headers.TryAddWithoutValidation("Authorization", "bearer " + requestToken);
                    request.Headers.TryAddWithoutValidation("Accept", "application/json");

                    var (status, body) = await SendAsync(httpClient, request, cancellationToken).ConfigureAwait(false);
                    if (status < 200 || status > 299)
                    {
                        throw new InvalidOperationException($"GitHub Actions OIDC token request failed with status {status}.");
                    }

                    var token = ReadString(body, "value");
                    if (string.IsNullOrWhiteSpace(token))
                    {
                        throw new InvalidOperationException("GitHub Actions OIDC token response did not include a token.");
                    }

                    var expiresAt = ReadJwtExpiry(token);
                    cachedToken = expiresAt is null ? null : token;
                    cachedUntil = expiresAt is null ? DateTimeOffset.MinValue : expiresAt.Value - RefreshBeforeExpiry;
                    return token;
                }
                finally
                {
                    gate.Release();
                }
            };
        }

        /// <summary>
        /// Returns a provider that exchanges a Vercel OIDC token for one issued to <paramref name="audience"/>.
        /// The source token is <paramref name="sourceToken"/>, else <paramref name="sourceTokenProvider"/> (for example the
        /// request's <c>x-vercel-oidc-token</c> header), else the file named by <c>VERCEL_OIDC_TOKEN_FILE</c>, else <c>VERCEL_OIDC_TOKEN</c>.
        /// </summary>
        /// <param name="audience">Token audience. Defaults to <see cref="DefaultAudience"/>.</param>
        /// <param name="sourceToken">A fixed Vercel OIDC token to exchange.</param>
        /// <param name="sourceTokenProvider">Returns the Vercel OIDC token to exchange, called on every request.</param>
        /// <param name="httpClient">HttpClient used for the exchange. Defaults to a shared client.</param>
        /// <param name="environment">Environment variable lookup. Defaults to <see cref="Environment.GetEnvironmentVariable(string)"/>.</param>
        /// <param name="timeProvider">Clock used for token expiry. Defaults to <see cref="TimeProvider.System"/>.</param>
        /// <param name="exchangeUrl">Token exchange URL. Defaults to <see cref="VercelExchangeUrl"/>.</param>
        public static Func<CancellationToken, ValueTask<string>> Vercel(
            string audience = DefaultAudience,
            string? sourceToken = null,
            Func<CancellationToken, ValueTask<string>>? sourceTokenProvider = null,
            HttpClient? httpClient = null,
            Func<string, string?>? environment = null,
            TimeProvider? timeProvider = null,
            string exchangeUrl = VercelExchangeUrl)
        {
            var env = environment ?? Environment.GetEnvironmentVariable;
            var clock = timeProvider ?? TimeProvider.System;
            var gate = new SemaphoreSlim(1, 1);
            string? cachedSource = null;
            string? cachedToken = null;
            var cachedUntil = DateTimeOffset.MinValue;

            return async cancellationToken =>
            {
                var source = (await ResolveVercelSourceAsync(sourceToken, sourceTokenProvider, env, cancellationToken).ConfigureAwait(false))?.Trim();
                if (string.IsNullOrEmpty(source))
                {
                    throw new InvalidOperationException(
                        "Vercel OIDC token is unavailable: pass a source token or set VERCEL_OIDC_TOKEN_FILE or VERCEL_OIDC_TOKEN. " +
                        "Enable OIDC federation in the Vercel project settings.");
                }

                await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
                    if (cachedToken is not null && cachedSource == source && clock.GetUtcNow() < cachedUntil)
                    {
                        return cachedToken;
                    }

                    using var request = new HttpRequestMessage(HttpMethod.Post, exchangeUrl)
                    {
                        Content = new StringContent(
                            JsonSerializer.Serialize(new Dictionary<string, string> { ["token"] = source, ["aud"] = audience }),
                            Encoding.UTF8,
                            "application/json")
                    };
                    request.Headers.TryAddWithoutValidation("Accept", "application/json");

                    var (status, body) = await SendAsync(httpClient, request, cancellationToken).ConfigureAwait(false);
                    if (status < 200 || status > 299)
                    {
                        var error = ReadString(body, "error");
                        throw new InvalidOperationException(string.IsNullOrWhiteSpace(error)
                            ? $"Vercel OIDC token exchange failed with status {status}."
                            : $"Vercel OIDC token exchange failed with status {status}: {error}");
                    }

                    var token = ReadString(body, "token");
                    if (string.IsNullOrWhiteSpace(token))
                    {
                        throw new InvalidOperationException("Vercel OIDC token exchange response did not include a token.");
                    }

                    var expiresAt = ReadUnixSeconds(body, "expiry") ?? ReadJwtExpiry(token);
                    cachedSource = expiresAt is null ? null : source;
                    cachedToken = expiresAt is null ? null : token;
                    cachedUntil = expiresAt is null ? DateTimeOffset.MinValue : expiresAt.Value - RefreshBeforeExpiry;
                    return token;
                }
                finally
                {
                    gate.Release();
                }
            };
        }

        private static async ValueTask<string?> ResolveVercelSourceAsync(
            string? sourceToken,
            Func<CancellationToken, ValueTask<string>>? sourceTokenProvider,
            Func<string, string?> env,
            CancellationToken cancellationToken)
        {
            if (!string.IsNullOrWhiteSpace(sourceToken))
            {
                return sourceToken;
            }

            if (sourceTokenProvider is not null)
            {
                return await sourceTokenProvider(cancellationToken).ConfigureAwait(false);
            }

            var file = env("VERCEL_OIDC_TOKEN_FILE");
            if (!string.IsNullOrWhiteSpace(file))
            {
                return await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
            }

            return env("VERCEL_OIDC_TOKEN");
        }

        private static async Task<(int Status, string Body)> SendAsync(HttpClient? httpClient, HttpRequestMessage request, CancellationToken cancellationToken)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(RequestTimeout);
            using var response = await (httpClient ?? SharedHttpClient.Value).SendAsync(request, timeout.Token).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
            return ((int)response.StatusCode, body);
        }

        private static string? ReadString(string body, string name)
        {
            try
            {
                using var json = JsonDocument.Parse(body);
                return json.RootElement.ValueKind == JsonValueKind.Object &&
                       json.RootElement.TryGetProperty(name, out var value) &&
                       value.ValueKind == JsonValueKind.String
                    ? value.GetString()
                    : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private static DateTimeOffset? ReadUnixSeconds(string body, string name)
        {
            try
            {
                using var json = JsonDocument.Parse(body);
                return json.RootElement.ValueKind == JsonValueKind.Object &&
                       json.RootElement.TryGetProperty(name, out var value)
                    ? ToUnixTime(value)
                    : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        // Reads `exp` from the JWT payload without verifying the signature; the gateway verifies it.
        private static DateTimeOffset? ReadJwtExpiry(string token)
        {
            var parts = token.Split('.');
            if (parts.Length < 2)
            {
                return null;
            }

            try
            {
                var payload = parts[1].Replace('-', '+').Replace('_', '/');
                payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
                using var json = JsonDocument.Parse(Convert.FromBase64String(payload));
                return json.RootElement.ValueKind == JsonValueKind.Object &&
                       json.RootElement.TryGetProperty("exp", out var exp)
                    ? ToUnixTime(exp)
                    : null;
            }
            catch (Exception error) when (error is FormatException or JsonException)
            {
                return null;
            }
        }

        private static DateTimeOffset? ToUnixTime(JsonElement value)
        {
            if (value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var seconds) || double.IsNaN(seconds) || seconds <= 0 || seconds > 253402300799)
            {
                return null;
            }

            return DateTimeOffset.FromUnixTimeMilliseconds((long)(seconds * 1000));
        }
    }
}
