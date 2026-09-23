use std::collections::HashMap;
use std::env;
use std::error::Error;
use std::fmt;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde_json::Value;
use url::{Host, Url};

const DEFAULT_BASE_URL: &str = "https://api.phaseo.app/v1";

#[derive(Clone, Debug, PartialEq)]
pub struct PhaseoResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Value,
    pub request_id: Option<String>,
    pub trace_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PhaseoError {
    pub message: String,
    pub status: Option<u16>,
    pub headers: Box<HashMap<String, String>>,
    pub body: Option<Box<Value>>,
    pub code: Option<Box<str>>,
    pub generation_id: Option<Box<str>>,
    pub error_type: Option<Box<str>>,
    pub error_origin: Option<Box<str>>,
    pub retryable: Option<bool>,
    pub action: Option<Box<str>>,
    pub docs_url: Option<Box<str>>,
    pub support_url: Option<Box<str>>,
    pub retry_after_seconds: Option<u64>,
    pub details: Option<Box<Value>>,
    pub request_id: Option<Box<str>>,
    pub trace_url: Option<Box<str>>,
    pub retry_after: Option<Box<str>>,
}

impl PhaseoError {
    fn configuration(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: None,
            headers: Box::new(HashMap::new()),
            body: None,
            code: None,
            generation_id: None,
            error_type: None,
            error_origin: None,
            retryable: None,
            action: None,
            docs_url: None,
            support_url: None,
            retry_after_seconds: None,
            details: None,
            request_id: None,
            trace_url: None,
            retry_after: None,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct RequestOptions {
    pub headers: HashMap<String, String>,
    pub timeout: Option<Duration>,
    pub max_retries: Option<u32>,
    pub idempotency_key: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RequestEvent {
    pub method: String,
    pub path: String,
    pub attempt: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ResponseEvent {
    pub method: String,
    pub path: String,
    pub attempt: u32,
    pub status: u16,
    pub headers: HashMap<String, String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RetryEvent {
    pub method: String,
    pub path: String,
    pub attempt: u32,
    pub status: Option<u16>,
    pub delay: Duration,
}

pub type RequestHook = Arc<dyn Fn(&RequestEvent) + Send + Sync>;
pub type ResponseHook = Arc<dyn Fn(&ResponseEvent) + Send + Sync>;
pub type RetryHook = Arc<dyn Fn(&RetryEvent) + Send + Sync>;

impl fmt::Display for PhaseoError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.status {
            Some(status) => write!(
                formatter,
                "Phaseo request failed ({status}): {}",
                self.message
            ),
            None => formatter.write_str(&self.message),
        }
    }
}

impl Error for PhaseoError {}

/// Authenticated Phaseo Gateway client.
#[derive(Clone)]
pub struct Phaseo {
    api_key: String,
    base_url: String,
    headers: HashMap<String, String>,
    agent: ureq::Agent,
    timeout: Duration,
    max_retries: u32,
    on_request: Option<RequestHook>,
    on_response: Option<ResponseHook>,
    on_retry: Option<RetryHook>,
}

impl fmt::Debug for Phaseo {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let header_names: Vec<&str> = self.headers.keys().map(String::as_str).collect();
        formatter
            .debug_struct("Phaseo")
            .field("api_key", &"[REDACTED]")
            .field("base_url", &self.base_url)
            .field("header_names", &header_names)
            .finish_non_exhaustive()
    }
}

impl Phaseo {
    pub fn new(api_key: impl Into<String>) -> Result<Self, PhaseoError> {
        let api_key = api_key.into();
        if api_key.trim().is_empty() {
            return Err(PhaseoError::configuration(
                "Phaseo API key must not be empty",
            ));
        }

        Ok(Self {
            api_key,
            base_url: DEFAULT_BASE_URL.to_string(),
            headers: HashMap::new(),
            agent: ureq::AgentBuilder::new().build(),
            timeout: Duration::from_secs(60),
            max_retries: 0,
            on_request: None,
            on_response: None,
            on_retry: None,
        })
    }

    pub fn from_env() -> Result<Self, PhaseoError> {
        let api_key = env::var("PHASEO_API_KEY")
            .map_err(|_| PhaseoError::configuration("PHASEO_API_KEY is required"))?;
        let mut client = Self::new(api_key)?;
        if let Ok(base_url) = env::var("PHASEO_BASE_URL") {
            client = client.with_base_url(base_url)?;
        }
        Ok(client)
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Result<Self, PhaseoError> {
        let base_url = base_url.into();
        let parsed = Url::parse(&base_url)
            .map_err(|_| PhaseoError::configuration("Phaseo base URL must be a valid URL"))?;
        let is_https = parsed.scheme() == "https" && parsed.host().is_some();
        let is_loopback_http = parsed.scheme() == "http"
            && match parsed.host() {
                Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
                Some(Host::Ipv4(address)) => address.is_loopback(),
                Some(Host::Ipv6(address)) => address.is_loopback(),
                None => false,
            };
        if !is_https && !is_loopback_http {
            return Err(PhaseoError::configuration(
                "Phaseo base URL must use HTTPS (HTTP is allowed only for localhost)",
            ));
        }
        self.base_url = parsed.as_str().trim_end_matches('/').to_string();
        Ok(self)
    }

    pub fn with_header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(name.into(), value.into());
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    pub fn with_request_hooks(
        mut self,
        on_request: Option<RequestHook>,
        on_response: Option<ResponseHook>,
        on_retry: Option<RetryHook>,
    ) -> Self {
        self.on_request = on_request;
        self.on_response = on_response;
        self.on_retry = on_retry;
        self
    }

    pub fn chat_completions(&self, request: &Value) -> Result<PhaseoResponse, PhaseoError> {
        self.post("/chat/completions", request)
    }

    pub fn responses(&self, request: &Value) -> Result<PhaseoResponse, PhaseoError> {
        self.post("/responses", request)
    }

    /// Returns live, provider-specific endpoint metadata for a model.
    pub fn model_endpoint_capabilities(
        &self,
        model_id: &str,
    ) -> Result<PhaseoResponse, PhaseoError> {
        let mut parts = model_id.trim().splitn(2, '/');
        let author = parts.next().unwrap_or("");
        let slug = parts.next().unwrap_or("");
        if author.is_empty() || slug.is_empty() {
            return Err(PhaseoError::configuration(
                "model ID must use author/slug format",
            ));
        }
        let mut url = Url::parse(&self.base_url)
            .map_err(|_| PhaseoError::configuration("Phaseo base URL must be a valid URL"))?;
        {
            let mut segments = url.path_segments_mut().map_err(|_| {
                PhaseoError::configuration("Phaseo base URL cannot be used for model endpoints")
            })?;
            segments
                .pop_if_empty()
                .push("models")
                .push(author)
                .push(slug)
                .push("endpoints");
        }
        self.request_url("GET", url.as_str(), None, &RequestOptions::default())
    }

    /// Fetches endpoint metadata and evaluates the supplied parameter values.
    pub fn check_model_parameters(
        &self,
        model_id: &str,
        values: &HashMap<String, Value>,
        options: &crate::ParameterSupportOptions,
    ) -> Result<Value, PhaseoError> {
        let response = self.model_endpoint_capabilities(model_id)?;
        Ok(crate::check_parameter_support(
            &response.body,
            values,
            options,
        ))
    }

    /// Validates all non-structural fields in a complete request against live routes.
    pub fn preflight_request(
        &self,
        request: &Value,
        options: &crate::ParameterSupportOptions,
    ) -> Result<Value, PhaseoError> {
        let object = request
            .as_object()
            .ok_or_else(|| PhaseoError::configuration("preflight requires an object request"))?;
        let model_id = object
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if model_id.is_empty() {
            return Err(PhaseoError::configuration(
                "preflight requires request model",
            ));
        }
        let structural = [
            "model",
            "input",
            "messages",
            "prompt",
            "contents",
            "provider",
            "providers",
            "routing",
            "metadata",
            "session_id",
            "app",
            "webhook",
            "idempotency_key",
        ];
        let values: HashMap<String, Value> = object
            .iter()
            .filter(|(name, value)| !value.is_null() && !structural.contains(&name.as_str()))
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect();
        let support = self.check_model_parameters(model_id, &values, options)?;
        Ok(serde_json::json!({
            "ok": support.get("ok").and_then(Value::as_bool).unwrap_or(false),
            "model_id": model_id,
            "checked_parameters": values,
            "parameter_support": support,
        }))
    }

    pub fn post(&self, path: &str, request: &Value) -> Result<PhaseoResponse, PhaseoError> {
        self.request("POST", path, Some(request), &RequestOptions::default())
    }

    pub fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&Value>,
        options: &RequestOptions,
    ) -> Result<PhaseoResponse, PhaseoError> {
        let url = format!("{}{}", self.base_url, normalized_path(path));
        self.request_url(method, &url, body, options)
    }

    fn request_url(
        &self,
        method: &str,
        url: &str,
        body: Option<&Value>,
        options: &RequestOptions,
    ) -> Result<PhaseoResponse, PhaseoError> {
        let method = method.to_uppercase();
        let path = Url::parse(url)
            .map(|parsed| parsed.path().to_string())
            .unwrap_or_else(|_| url.to_string());
        let max_retries = if method == "GET" || method == "HEAD" {
            options.max_retries.unwrap_or(self.max_retries)
        } else {
            0
        };
        let mut attempt = 0;
        loop {
            let mut builder = self
                .agent
                .request(&method, url)
                .set("Authorization", &format!("Bearer {}", self.api_key))
                .set("X-Phaseo-Client", "phaseo-rust")
                .set("X-Phaseo-Client-Version", env!("CARGO_PKG_VERSION"))
                .set(
                    "User-Agent",
                    concat!("phaseo-rust/", env!("CARGO_PKG_VERSION")),
                )
                .timeout(options.timeout.unwrap_or(self.timeout));
            if body.is_some() {
                builder = builder.set("Content-Type", "application/json");
            }
            for (name, value) in self.headers.iter().chain(options.headers.iter()) {
                builder = builder.set(name, value);
            }
            if let Some(key) = &options.idempotency_key {
                builder = builder.set("Idempotency-Key", key);
            }
            if let Some(hook) = &self.on_request {
                hook(&RequestEvent {
                    method: method.clone(),
                    path: path.clone(),
                    attempt,
                });
            }
            let result = match body {
                Some(value) => builder.send_string(&value.to_string()),
                None => builder.call(),
            };
            let status = match &result {
                Ok(response) => Some(response.status()),
                Err(ureq::Error::Status(status, _)) => Some(*status),
                Err(ureq::Error::Transport(_)) => None,
            };
            let should_retry =
                attempt < max_retries && status.map(retryable_status).unwrap_or(true);
            if should_retry {
                let retry_after = match &result {
                    Ok(response) => response.header("retry-after"),
                    Err(ureq::Error::Status(_, response)) => response.header("retry-after"),
                    Err(ureq::Error::Transport(_)) => None,
                };
                let delay = retry_delay(retry_after, attempt);
                if let Some(hook) = &self.on_retry {
                    hook(&RetryEvent {
                        method: method.clone(),
                        path: path.clone(),
                        attempt: attempt + 1,
                        status,
                        delay,
                    });
                }
                if !delay.is_zero() {
                    thread::sleep(delay);
                }
                attempt += 1;
                continue;
            }
            if let Some(status) = status {
                let headers = match &result {
                    Ok(response) => response_headers(response),
                    Err(ureq::Error::Status(_, response)) => response_headers(response),
                    Err(ureq::Error::Transport(_)) => HashMap::new(),
                };
                if let Some(hook) = &self.on_response {
                    hook(&ResponseEvent {
                        method: method.clone(),
                        path: path.clone(),
                        attempt,
                        status,
                        headers,
                    });
                }
            }
            return parse_response(result);
        }
    }
}

fn normalized_path(path: &str) -> String {
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    }
}

fn request_trace_url(request_id: Option<&str>) -> Option<String> {
    request_id.map(|id| {
        format!(
            "https://phaseo.app/settings/usage/logs/requests/{}",
            url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>()
        )
    })
}

fn parse_response(
    result: Result<ureq::Response, ureq::Error>,
) -> Result<PhaseoResponse, PhaseoError> {
    match result {
        Ok(response) => {
            let status = response.status();
            let headers = response_headers(&response);
            let request_id = headers.get("x-request-id").cloned();
            let trace_url = request_trace_url(request_id.as_deref());
            let raw = response.into_string().map_err(|error| PhaseoError {
                message: error.to_string(),
                status: Some(status),
                headers: Box::new(headers.clone()),
                body: None,
                code: None,
                generation_id: None,
                error_type: None,
                error_origin: None,
                retryable: None,
                action: None,
                docs_url: None,
                support_url: None,
                retry_after_seconds: None,
                details: None,
                request_id: request_id.clone().map(String::into_boxed_str),
                trace_url: trace_url.clone().map(String::into_boxed_str),
                retry_after: headers
                    .get("retry-after")
                    .cloned()
                    .map(String::into_boxed_str),
            })?;
            let body = parse_json_body(&raw);
            Ok(PhaseoResponse {
                status,
                headers,
                body,
                request_id,
                trace_url,
            })
        }
        Err(ureq::Error::Status(status, response)) => {
            let headers = response_headers(&response);
            let raw = response.into_string().unwrap_or_default();
            let body = parse_json_body(&raw);
            let request_id = body
                .get("request_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .or_else(|| headers.get("x-request-id").cloned())
                .or_else(|| headers.get("x-phaseo-request-id").cloned());
            let trace_url = request_trace_url(request_id.as_deref());
            let message = body
                .pointer("/error/message")
                .and_then(Value::as_str)
                .or_else(|| body.get("message").and_then(Value::as_str))
                .unwrap_or("Phaseo returned an error")
                .to_string();
            let code = body
                .pointer("/error/code")
                .and_then(Value::as_str)
                .or_else(|| body.get("code").and_then(Value::as_str))
                .or_else(|| body.get("error").and_then(Value::as_str))
                .map(Into::into);
            Err(PhaseoError {
                message,
                status: Some(status),
                code,
                generation_id: body
                    .get("generation_id")
                    .and_then(Value::as_str)
                    .map(Into::into),
                error_type: body
                    .get("error_type")
                    .and_then(Value::as_str)
                    .map(Into::into),
                error_origin: body
                    .get("error_origin")
                    .and_then(Value::as_str)
                    .map(Into::into),
                retryable: body.get("retryable").and_then(Value::as_bool),
                action: body.get("action").and_then(Value::as_str).map(Into::into),
                docs_url: body.get("docs_url").and_then(Value::as_str).map(Into::into),
                support_url: body
                    .get("support_url")
                    .and_then(Value::as_str)
                    .map(Into::into),
                retry_after_seconds: body
                    .get("retry_after_seconds")
                    .and_then(Value::as_u64)
                    .or_else(|| {
                        headers
                            .get("retry-after")
                            .and_then(|value| value.parse::<u64>().ok())
                    }),
                details: body.get("details").cloned().map(Box::new),
                request_id: request_id.map(String::into_boxed_str),
                trace_url: trace_url.map(String::into_boxed_str),
                retry_after: headers
                    .get("retry-after")
                    .map(|value| value.clone().into_boxed_str()),
                headers: Box::new(headers),
                body: Some(Box::new(body)),
            })
        }
        Err(ureq::Error::Transport(error)) => Err(PhaseoError {
            message: format!("Phaseo transport error: {error}"),
            status: None,
            headers: Box::new(HashMap::new()),
            body: None,
            code: None,
            generation_id: None,
            error_type: None,
            error_origin: None,
            retryable: None,
            action: None,
            docs_url: None,
            support_url: None,
            retry_after_seconds: None,
            details: None,
            request_id: None,
            trace_url: None,
            retry_after: None,
        }),
    }
}

fn response_headers(response: &ureq::Response) -> HashMap<String, String> {
    response
        .headers_names()
        .into_iter()
        .filter_map(|name| {
            response
                .header(&name)
                .map(|value| (name.to_lowercase(), value.to_string()))
        })
        .collect()
}

fn retryable_status(status: u16) -> bool {
    matches!(status, 408 | 429 | 500 | 502 | 503 | 504)
}

fn retry_delay(retry_after: Option<&str>, attempt: u32) -> Duration {
    if let Some(seconds) = retry_after.and_then(|value| value.parse::<f64>().ok()) {
        return Duration::from_secs_f64(seconds.clamp(0.0, 60.0));
    }
    Duration::from_millis((250_u64.saturating_mul(2_u64.saturating_pow(attempt))).min(8_000))
}

fn parse_json_body(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    #[test]
    fn rejects_insecure_remote_base_urls() {
        let error = Phaseo::new("test")
            .unwrap()
            .with_base_url("http://example.com/v1")
            .unwrap_err();
        assert!(error.message.contains("HTTPS"));
    }

    #[test]
    fn rejects_hosts_that_only_start_with_localhost() {
        let error = Phaseo::new("test")
            .unwrap()
            .with_base_url("http://localhost.attacker.example/v1")
            .unwrap_err();
        assert!(error.message.contains("HTTPS"));
    }

    #[test]
    fn permits_exact_loopback_http_urls() {
        Phaseo::new("test")
            .unwrap()
            .with_base_url("http://localhost:8787/v1")
            .unwrap();
        Phaseo::new("test")
            .unwrap()
            .with_base_url("http://[::1]:8787/v1")
            .unwrap();
    }

    #[test]
    fn debug_output_redacts_the_api_key() {
        let output = format!(
            "{:?}",
            Phaseo::new("secret-value")
                .unwrap()
                .with_header("x-extra-token", "other-secret")
        );
        assert!(!output.contains("secret-value"));
        assert!(!output.contains("other-secret"));
        assert!(output.contains("[REDACTED]"));
        assert!(output.contains("x-extra-token"));
    }

    #[test]
    fn core_transport_contract_preserves_metadata_and_retries_safe_reads_only() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let captured = Arc::new(Mutex::new(Vec::new()));
        let server_captured = Arc::clone(&captured);
        let server = thread::spawn(move || {
            let responses = [
                "HTTP/1.1 503 Service Unavailable\r\nRetry-After: 0\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Request-Id: req/rust\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}",
                "HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nX-Request-Id: req-rust-error\r\nContent-Length: 44\r\nConnection: close\r\n\r\n{\"error\":{\"code\":\"temporarily_unavailable\"}}",
            ];
            for response in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                loop {
                    let mut chunk = [0_u8; 1024];
                    let size = stream.read(&mut chunk).unwrap();
                    request.extend_from_slice(&chunk[..size]);
                    let text = String::from_utf8_lossy(&request);
                    let Some(header_end) = text.find("\r\n\r\n") else {
                        continue;
                    };
                    let content_length = text[..header_end]
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|value| value.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
                server_captured
                    .lock()
                    .unwrap()
                    .push(String::from_utf8_lossy(&request).to_string());
                stream.write_all(response.as_bytes()).unwrap();
            }
        });

        let requests = Arc::new(AtomicUsize::new(0));
        let retries = Arc::new(AtomicUsize::new(0));
        let request_count = Arc::clone(&requests);
        let retry_count = Arc::clone(&retries);
        let client = Phaseo::new("test")
            .unwrap()
            .with_base_url(format!("http://{address}"))
            .unwrap()
            .with_request_hooks(
                Some(Arc::new(move |_| {
                    request_count.fetch_add(1, Ordering::SeqCst);
                })),
                None,
                Some(Arc::new(move |_| {
                    retry_count.fetch_add(1, Ordering::SeqCst);
                })),
            );
        let read = client
            .request(
                "GET",
                "/safe",
                None,
                &RequestOptions {
                    max_retries: Some(1),
                    ..RequestOptions::default()
                },
            )
            .unwrap();
        assert_eq!(read.request_id.as_deref(), Some("req/rust"));
        assert_eq!(
            read.trace_url.as_deref(),
            Some("https://phaseo.app/settings/usage/logs/requests/req%2Frust")
        );

        let error = client
            .request(
                "POST",
                "/write",
                Some(&serde_json::json!({"model": "test"})),
                &RequestOptions {
                    max_retries: Some(5),
                    idempotency_key: Some("idem-rust".to_string()),
                    ..RequestOptions::default()
                },
            )
            .unwrap_err();
        assert_eq!(error.status, Some(503));
        assert_eq!(error.code.as_deref(), Some("temporarily_unavailable"));
        assert_eq!(error.request_id.as_deref(), Some("req-rust-error"));
        assert_eq!(requests.load(Ordering::SeqCst), 3);
        assert_eq!(retries.load(Ordering::SeqCst), 1);
        server.join().unwrap();
        assert!(captured.lock().unwrap()[2].contains("Idempotency-Key: idem-rust"));
    }
}
