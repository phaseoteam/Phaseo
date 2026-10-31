package app.phaseo.sdk;

import java.io.IOException;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;

/**
 * Adds {@code Authorization: Bearer <credential>} from an {@link ApiKeyProvider} to every
 * request it sends, unless the request already has an Authorization header. The generated
 * client calls {@code send} once per attempt, so each retry gets a fresh credential.
 */
final class ApiKeyProviderHttpClient extends HttpClient {
	private final HttpClient delegate;
	private final ApiKeyProvider provider;

	ApiKeyProviderHttpClient(HttpClient delegate, ApiKeyProvider provider) {
		this.delegate = delegate;
		this.provider = provider;
	}

	/** Calls the provider and returns the trimmed credential, or throws without sending anything. */
	static String resolve(ApiKeyProvider provider) throws IOException, InterruptedException {
		String value;
		try {
			value = provider.get();
		} catch (IOException | InterruptedException | RuntimeException error) {
			throw error;
		} catch (Exception error) {
			throw new IOException("The API key provider failed: " + error.getMessage(), error);
		}
		String credential = value == null ? "" : value.trim();
		if (credential.isEmpty()) {
			throw new IllegalStateException("The API key provider returned an empty credential.");
		}
		return credential;
	}

	private HttpRequest authorize(HttpRequest request) throws IOException, InterruptedException {
		if (request.headers().firstValue("Authorization").isPresent()) {
			return request;
		}
		return HttpRequest.newBuilder(request, (name, value) -> true)
			.setHeader("Authorization", "Bearer " + resolve(provider))
			.build();
	}

	@Override
	public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler) throws IOException, InterruptedException {
		return delegate.send(authorize(request), handler);
	}

	@Override
	public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest request, HttpResponse.BodyHandler<T> handler) {
		return authorizeAsync(request).thenCompose(authorized -> delegate.sendAsync(authorized, handler));
	}

	@Override
	public <T> CompletableFuture<HttpResponse<T>> sendAsync(
		HttpRequest request,
		HttpResponse.BodyHandler<T> handler,
		HttpResponse.PushPromiseHandler<T> pushPromiseHandler
	) {
		return authorizeAsync(request).thenCompose(authorized -> delegate.sendAsync(authorized, handler, pushPromiseHandler));
	}

	private CompletableFuture<HttpRequest> authorizeAsync(HttpRequest request) {
		Executor executor = delegate.executor().orElse(null);
		java.util.function.Supplier<HttpRequest> task = () -> {
			try {
				return authorize(request);
			} catch (IOException | InterruptedException error) {
				throw new CompletionException(error);
			}
		};
		return executor == null ? CompletableFuture.supplyAsync(task) : CompletableFuture.supplyAsync(task, executor);
	}

	@Override public Optional<CookieHandler> cookieHandler() { return delegate.cookieHandler(); }
	@Override public Optional<Duration> connectTimeout() { return delegate.connectTimeout(); }
	@Override public Redirect followRedirects() { return delegate.followRedirects(); }
	@Override public Optional<ProxySelector> proxy() { return delegate.proxy(); }
	@Override public SSLContext sslContext() { return delegate.sslContext(); }
	@Override public SSLParameters sslParameters() { return delegate.sslParameters(); }
	@Override public Optional<Authenticator> authenticator() { return delegate.authenticator(); }
	@Override public Version version() { return delegate.version(); }
	@Override public Optional<Executor> executor() { return delegate.executor(); }
	@Override public WebSocket.Builder newWebSocketBuilder() { return delegate.newWebSocketBuilder(); }

	@Override
	public String toString() {
		return "ApiKeyProviderHttpClient";
	}
}
