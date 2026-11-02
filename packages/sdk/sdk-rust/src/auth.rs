//! Per-request credentials for trusted workloads.
//!
//! [`Phaseo::from_api_key_provider`](crate::Phaseo::from_api_key_provider) takes an
//! [`ApiKeyProvider`] that returns the credential for each request: an API key, or a
//! short-lived token such as a GitHub Actions or Vercel OIDC token. It is called before
//! every request and retry, so it can refresh tokens; cache inside it if fetching a
//! token is expensive. [`github_actions_token`] and [`vercel_token`] do that for you.

use std::env;
use std::error::Error;
use std::fs;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::PhaseoError;

/// Returns the credential for one request. Called before every attempt, including retries.
pub type ApiKeyProvider =
    Arc<dyn Fn() -> Result<String, Box<dyn Error + Send + Sync>> + Send + Sync>;

/// The audience Phaseo accepts on OIDC tokens.
pub const DEFAULT_AUDIENCE: &str = "https://api.phaseo.app";

const VERCEL_EXCHANGE_URL: &str = "https://oidc.vercel.com/~token";
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);
/// Tokens are refreshed this many seconds before they expire.
const EXPIRY_MARGIN_SECS: u64 = 60;

type EnvLookup = Arc<dyn Fn(&str) -> Option<String> + Send + Sync>;
type Clock = Arc<dyn Fn() -> u64 + Send + Sync>;

struct CachedToken {
    source: String,
    token: String,
    expires_at: u64,
}

/// Fetches GitHub Actions OIDC tokens. The job needs `permissions: id-token: write`.
///
/// Tokens are reused until 60 seconds before their `exp`.
pub struct GitHubActionsToken {
    audience: String,
    agent: ureq::Agent,
    env: EnvLookup,
    now: Clock,
    cache: Mutex<Option<CachedToken>>,
}

impl Default for GitHubActionsToken {
    fn default() -> Self {
        Self::new()
    }
}

impl GitHubActionsToken {
    pub fn new() -> Self {
        Self {
            audience: DEFAULT_AUDIENCE.to_string(),
            agent: token_agent(),
            env: Arc::new(|name| env::var(name).ok()),
            now: Arc::new(unix_now),
            cache: Mutex::new(None),
        }
    }

    pub fn audience(mut self, audience: impl Into<String>) -> Self {
        self.audience = audience.into();
        self
    }

    /// Returns a current token, fetching a new one when the cached one is near expiry.
    pub fn token(&self) -> Result<String, PhaseoError> {
        let now = (self.now)();
        if let Some(token) = cached(&self.cache, "", now) {
            return Ok(token);
        }
        let (Some(request_url), Some(request_token)) = (
            non_empty((self.env)("ACTIONS_ID_TOKEN_REQUEST_URL")),
            non_empty((self.env)("ACTIONS_ID_TOKEN_REQUEST_TOKEN")),
        ) else {
            return Err(PhaseoError::configuration(
                "GitHub Actions OIDC token unavailable: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set. Give the job `permissions: id-token: write`.",
            ));
        };
        let separator = if request_url.contains('?') { '&' } else { '?' };
        let url = format!(
            "{request_url}{separator}audience={}",
            url::form_urlencoded::byte_serialize(self.audience.as_bytes()).collect::<String>()
        );
        let result = self
            .agent
            .get(&url)
            .set("Authorization", &format!("bearer {request_token}"))
            .set("Accept", "application/json")
            .call();
        let body = response_json(result, "GitHub Actions OIDC token request")?;
        let token = body
            .get("value")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                PhaseoError::configuration("GitHub Actions OIDC token response has no value")
            })?
            .to_string();
        store(&self.cache, String::new(), &token, jwt_expiry(&token));
        Ok(token)
    }

    pub fn into_provider(self) -> ApiKeyProvider {
        Arc::new(move || self.token().map_err(Into::into))
    }
}

/// A credential provider that sends GitHub Actions OIDC tokens for `https://api.phaseo.app`.
pub fn github_actions_token() -> ApiKeyProvider {
    GitHubActionsToken::new().into_provider()
}

enum VercelSource {
    Default,
    Token(String),
    Provider(ApiKeyProvider),
}

/// Exchanges a Vercel OIDC token for one issued to Phaseo's audience.
///
/// The source token defaults to the file named by `VERCEL_OIDC_TOKEN_FILE`, then
/// `VERCEL_OIDC_TOKEN`. Exchanged tokens are reused for the same source token until
/// 60 seconds before they expire.
pub struct VercelToken {
    audience: String,
    source: VercelSource,
    exchange_url: String,
    agent: ureq::Agent,
    env: EnvLookup,
    now: Clock,
    cache: Mutex<Option<CachedToken>>,
}

impl Default for VercelToken {
    fn default() -> Self {
        Self::new()
    }
}

impl VercelToken {
    pub fn new() -> Self {
        Self {
            audience: DEFAULT_AUDIENCE.to_string(),
            source: VercelSource::Default,
            exchange_url: VERCEL_EXCHANGE_URL.to_string(),
            agent: token_agent(),
            env: Arc::new(|name| env::var(name).ok()),
            now: Arc::new(unix_now),
            cache: Mutex::new(None),
        }
    }

    pub fn audience(mut self, audience: impl Into<String>) -> Self {
        self.audience = audience.into();
        self
    }

    /// Uses this Vercel OIDC token instead of the environment.
    pub fn source_token(mut self, token: impl Into<String>) -> Self {
        self.source = VercelSource::Token(token.into());
        self
    }

    /// Reads the Vercel OIDC token on each call, for example from the
    /// `x-vercel-oidc-token` header of the request being handled.
    pub fn source_provider(mut self, provider: ApiKeyProvider) -> Self {
        self.source = VercelSource::Provider(provider);
        self
    }

    fn source(&self) -> Result<String, PhaseoError> {
        let token = match &self.source {
            VercelSource::Token(token) => Some(token.clone()),
            VercelSource::Provider(provider) => Some(provider().map_err(|error| {
                PhaseoError::configuration(format!("Vercel OIDC token source failed: {error}"))
            })?),
            VercelSource::Default => match non_empty((self.env)("VERCEL_OIDC_TOKEN_FILE")) {
                Some(path) => Some(fs::read_to_string(&path).map_err(|error| {
                    PhaseoError::configuration(format!(
                        "Could not read VERCEL_OIDC_TOKEN_FILE: {error}"
                    ))
                })?),
                None => (self.env)("VERCEL_OIDC_TOKEN"),
            },
        };
        non_empty(token).ok_or_else(|| {
            PhaseoError::configuration(
                "Vercel OIDC token unavailable: pass one, or set VERCEL_OIDC_TOKEN or VERCEL_OIDC_TOKEN_FILE",
            )
        })
    }

    /// Returns a current exchanged token, exchanging again when the cached one is near expiry.
    pub fn token(&self) -> Result<String, PhaseoError> {
        let source = self.source()?;
        let now = (self.now)();
        if let Some(token) = cached(&self.cache, &source, now) {
            return Ok(token);
        }
        let result = self
            .agent
            .post(&self.exchange_url)
            .set("Content-Type", "application/json")
            .set("Accept", "application/json")
            .send_string(&serde_json::json!({"token": source, "aud": self.audience}).to_string());
        let body = response_json(result, "Vercel OIDC token exchange")?;
        let token = body
            .get("token")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                PhaseoError::configuration("Vercel OIDC token exchange response has no token")
            })?
            .to_string();
        let expires_at = body
            .get("expiry")
            .and_then(Value::as_f64)
            .map(|expiry| expiry as u64)
            .or_else(|| jwt_expiry(&token));
        store(&self.cache, source, &token, expires_at);
        Ok(token)
    }

    pub fn into_provider(self) -> ApiKeyProvider {
        Arc::new(move || self.token().map_err(Into::into))
    }
}

/// A credential provider that sends exchanged Vercel OIDC tokens for `https://api.phaseo.app`.
pub fn vercel_token() -> ApiKeyProvider {
    VercelToken::new().into_provider()
}

fn token_agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build()
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn cached(cache: &Mutex<Option<CachedToken>>, source: &str, now: u64) -> Option<String> {
    let cache = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    cache
        .as_ref()
        .filter(|entry| entry.source == source && entry.expires_at > now + EXPIRY_MARGIN_SECS)
        .map(|entry| entry.token.clone())
}

fn store(cache: &Mutex<Option<CachedToken>>, source: String, token: &str, expires_at: Option<u64>) {
    let mut cache = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *cache = expires_at.map(|expires_at| CachedToken {
        source,
        token: token.to_string(),
        expires_at,
    });
}

/// Reads a 2xx JSON body. Errors carry the status and the response's `error` message, never tokens.
fn response_json(
    result: Result<ureq::Response, ureq::Error>,
    action: &str,
) -> Result<Value, PhaseoError> {
    let (status, response) = match result {
        Ok(response) => (response.status(), response),
        Err(ureq::Error::Status(status, response)) => (status, response),
        Err(ureq::Error::Transport(error)) => {
            return Err(PhaseoError::configuration(format!(
                "{action} failed: {}",
                error.kind()
            )))
        }
    };
    let body: Value =
        serde_json::from_str(&response.into_string().unwrap_or_default()).unwrap_or(Value::Null);
    if !(200..300).contains(&status) {
        let message = match body.get("error").and_then(Value::as_str) {
            Some(error) => format!("{action} failed ({status}): {error}"),
            None => format!("{action} failed with status {status}"),
        };
        return Err(PhaseoError::configuration(message));
    }
    Ok(body)
}

/// Reads `exp` from a JWT payload without checking the signature.
fn jwt_expiry(token: &str) -> Option<u64> {
    let payload = base64url_decode(token.split('.').nth(1)?)?;
    let claims: Value = serde_json::from_slice(&payload).ok()?;
    claims
        .get("exp")
        .and_then(Value::as_f64)
        .map(|exp| exp as u64)
}

fn base64url_decode(input: &str) -> Option<Vec<u8>> {
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let (mut buffer, mut bits) = (0_u32, 0_u32);
    for byte in input.trim_end_matches('=').bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            _ => return None,
        };
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    Some(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{header, serve};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicU64, Ordering};

    const NOW: u64 = 1_800_000_000;

    fn jwt(exp: u64) -> String {
        let payload = format!(r#"{{"sub":"repo:phaseo/app","exp":{exp}}}"#);
        format!(
            "eyJhbGciOiJSUzI1NiJ9.{}.signature",
            base64url(payload.as_bytes())
        )
    }

    fn base64url(bytes: &[u8]) -> String {
        const TABLE: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut output = String::new();
        for chunk in bytes.chunks(3) {
            let triple = (u32::from(chunk[0]) << 16)
                | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
                | u32::from(*chunk.get(2).unwrap_or(&0));
            for index in 0..=chunk.len() {
                output.push(TABLE[((triple >> (18 - index * 6)) & 0x3f) as usize] as char);
            }
        }
        output
    }

    fn json_response(status: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    fn fake_env(values: &[(&str, &str)]) -> EnvLookup {
        let values: HashMap<String, String> = values
            .iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect();
        Arc::new(move |name| values.get(name).cloned())
    }

    fn fake_clock() -> (Arc<AtomicU64>, Clock) {
        let now = Arc::new(AtomicU64::new(NOW));
        let reader = Arc::clone(&now);
        (now, Arc::new(move || reader.load(Ordering::SeqCst)))
    }

    #[test]
    fn decodes_jwt_expiry() {
        assert_eq!(jwt_expiry(&jwt(NOW)), Some(NOW));
        assert_eq!(jwt_expiry("not-a-jwt"), None);
        assert_eq!(base64url_decode("aGk").unwrap(), b"hi");
    }

    #[test]
    fn github_token_is_fetched_cached_and_refetched_near_expiry() {
        let first = jwt(NOW + 300);
        let second = jwt(NOW + 900);
        let (base, captured, server) = serve(vec![
            json_response("200 OK", &format!(r#"{{"value":"{first}"}}"#)),
            json_response("200 OK", &format!(r#"{{"value":"{second}"}}"#)),
        ]);
        let (clock, now) = fake_clock();
        let mut helper = GitHubActionsToken::new();
        helper.env = fake_env(&[
            (
                "ACTIONS_ID_TOKEN_REQUEST_URL",
                &format!("{base}/token?api-version=2.0"),
            ),
            ("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token"),
        ]);
        helper.now = now;
        let provider = helper.into_provider();

        assert_eq!(provider().unwrap(), first);
        clock.store(NOW + 239, Ordering::SeqCst);
        assert_eq!(provider().unwrap(), first, "reused until 60s before exp");
        clock.store(NOW + 240, Ordering::SeqCst);
        assert_eq!(provider().unwrap(), second, "refetched near exp");
        server.join().unwrap();

        let requests = captured.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests[0].starts_with(
            "GET /token?api-version=2.0&audience=https%3A%2F%2Fapi.phaseo.app HTTP/1.1"
        ));
        assert_eq!(
            header(&requests[0], "authorization").as_deref(),
            Some("bearer request-token")
        );
    }

    #[test]
    fn github_token_without_exp_is_not_cached_and_uses_custom_audience() {
        let (base, captured, server) = serve(vec![
            json_response("200 OK", r#"{"value":"opaque"}"#),
            json_response("200 OK", r#"{"value":"opaque-2"}"#),
        ]);
        let mut helper = GitHubActionsToken::new().audience("custom aud");
        helper.env = fake_env(&[
            ("ACTIONS_ID_TOKEN_REQUEST_URL", &format!("{base}/token")),
            ("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token"),
        ]);
        assert_eq!(helper.token().unwrap(), "opaque");
        assert_eq!(helper.token().unwrap(), "opaque-2");
        server.join().unwrap();
        assert!(captured.lock().unwrap()[0].starts_with("GET /token?audience=custom+aud HTTP/1.1"));
    }

    #[test]
    fn github_token_errors_name_the_permission_and_the_status() {
        let mut helper = GitHubActionsToken::new();
        helper.env = fake_env(&[]);
        let error = helper.token().unwrap_err();
        assert!(
            error.message.contains("id-token: write"),
            "{}",
            error.message
        );

        let (base, _, server) = serve(vec![json_response("403 Forbidden", "{}")]);
        helper.env = fake_env(&[
            ("ACTIONS_ID_TOKEN_REQUEST_URL", &format!("{base}/token")),
            ("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token"),
        ]);
        let error = helper.token().unwrap_err();
        server.join().unwrap();
        assert!(error.message.contains("403"), "{}", error.message);
        assert!(!error.message.contains("request-token"));
    }

    #[test]
    fn vercel_token_exchanges_the_file_source_and_caches_until_expiry() {
        let (base, captured, server) = serve(vec![
            json_response(
                "200 OK",
                &format!(r#"{{"token":"exchanged-1","expiry":{}}}"#, NOW + 600),
            ),
            json_response("200 OK", r#"{"token":"exchanged-2"}"#),
        ]);
        let path = env::temp_dir().join(format!("phaseo-vercel-oidc-{}", std::process::id()));
        fs::write(&path, "  file-source-token\n").unwrap();
        let (clock, now) = fake_clock();
        let mut helper = VercelToken::new();
        helper.exchange_url = format!("{base}/~token");
        helper.env = fake_env(&[
            ("VERCEL_OIDC_TOKEN_FILE", path.to_str().unwrap()),
            ("VERCEL_OIDC_TOKEN", "env-source-token"),
        ]);
        helper.now = now;
        let provider = helper.into_provider();

        assert_eq!(provider().unwrap(), "exchanged-1");
        clock.store(NOW + 539, Ordering::SeqCst);
        assert_eq!(provider().unwrap(), "exchanged-1");
        clock.store(NOW + 540, Ordering::SeqCst);
        assert_eq!(provider().unwrap(), "exchanged-2");
        server.join().unwrap();
        fs::remove_file(&path).unwrap();

        let requests = captured.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests[0].starts_with("POST /~token HTTP/1.1"));
        assert_eq!(
            header(&requests[0], "content-type").as_deref(),
            Some("application/json")
        );
        assert_eq!(
            header(&requests[0], "accept").as_deref(),
            Some("application/json")
        );
        let body: Value =
            serde_json::from_str(requests[0].split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(
            body,
            serde_json::json!({"token": "file-source-token", "aud": DEFAULT_AUDIENCE})
        );
    }

    #[test]
    fn vercel_token_reads_env_and_source_providers_and_uses_jwt_exp() {
        let exchanged = jwt(NOW + 600);
        let (base, captured, server) = serve(vec![
            json_response("200 OK", &format!(r#"{{"token":"{exchanged}"}}"#)),
            json_response("200 OK", r#"{"token":"from-header"}"#),
        ]);
        let (_, now) = fake_clock();
        let mut helper = VercelToken::new();
        helper.exchange_url = format!("{base}/~token");
        helper.env = fake_env(&[("VERCEL_OIDC_TOKEN", "env-source-token")]);
        helper.now = Arc::clone(&now);
        assert_eq!(helper.token().unwrap(), exchanged);
        assert_eq!(
            helper.token().unwrap(),
            exchanged,
            "cached from the JWT exp"
        );

        let mut from_header = VercelToken::new()
            .audience("custom")
            .source_provider(Arc::new(|| Ok("header-source-token".to_string())));
        from_header.exchange_url = format!("{base}/~token");
        from_header.env = fake_env(&[]);
        assert_eq!(from_header.token().unwrap(), "from-header");
        server.join().unwrap();

        let requests = captured.lock().unwrap();
        assert!(requests[0].contains(r#""token":"env-source-token""#));
        assert!(requests[1].contains(r#""token":"header-source-token""#));
        assert!(requests[1].contains(r#""aud":"custom""#));
    }

    #[test]
    fn vercel_token_surfaces_the_error_body_and_a_missing_source() {
        let mut helper = VercelToken::new();
        helper.env = fake_env(&[]);
        let error = helper.token().unwrap_err();
        assert!(
            error.message.contains("VERCEL_OIDC_TOKEN"),
            "{}",
            error.message
        );

        let (base, _, server) = serve(vec![json_response(
            "400 Bad Request",
            r#"{"error":"invalid audience"}"#,
        )]);
        let mut helper = VercelToken::new().source_token("source-token");
        helper.exchange_url = format!("{base}/~token");
        let error = helper.token().unwrap_err();
        server.join().unwrap();
        assert!(
            error.message.contains("invalid audience"),
            "{}",
            error.message
        );
        assert!(error.message.contains("400"), "{}", error.message);
        assert!(!error.message.contains("source-token"));
    }
}
