use std::collections::HashMap;
use std::env;
use std::error::Error;
use std::fmt;

use serde_json::Value;
use url::{Host, Url};

const DEFAULT_BASE_URL: &str = "https://api.phaseo.app/v1";

#[derive(Clone, Debug, PartialEq)]
pub struct PhaseoResponse {
    pub status: u16,
    pub body: Value,
    pub request_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PhaseoError {
    pub message: String,
    pub status: Option<u16>,
    pub body: Option<Value>,
}

impl PhaseoError {
    fn configuration(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: None,
            body: None,
        }
    }
}

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
        let mut builder = self
            .agent
            .get(url.as_str())
            .set("Authorization", &format!("Bearer {}", self.api_key))
            .set("X-Phaseo-Client", "phaseo-rust")
            .set("X-Phaseo-Client-Version", env!("CARGO_PKG_VERSION"))
            .set(
                "User-Agent",
                concat!("phaseo-rust/", env!("CARGO_PKG_VERSION")),
            );
        for (name, value) in &self.headers {
            builder = builder.set(name, value);
        }
        parse_response(builder.call())
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

    pub fn post(&self, path: &str, request: &Value) -> Result<PhaseoResponse, PhaseoError> {
        let url = format!("{}{}", self.base_url, normalized_path(path));
        let mut builder = self
            .agent
            .post(&url)
            .set("Authorization", &format!("Bearer {}", self.api_key))
            .set("Content-Type", "application/json")
            .set("X-Phaseo-Client", "phaseo-rust")
            .set("X-Phaseo-Client-Version", env!("CARGO_PKG_VERSION"))
            .set(
                "User-Agent",
                concat!("phaseo-rust/", env!("CARGO_PKG_VERSION")),
            );
        for (name, value) in &self.headers {
            builder = builder.set(name, value);
        }

        parse_response(builder.send_string(&request.to_string()))
    }
}

fn normalized_path(path: &str) -> String {
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    }
}

fn parse_response(
    result: Result<ureq::Response, ureq::Error>,
) -> Result<PhaseoResponse, PhaseoError> {
    match result {
        Ok(response) => {
            let status = response.status();
            let request_id = response.header("x-request-id").map(str::to_string);
            let raw = response.into_string().map_err(|error| PhaseoError {
                message: error.to_string(),
                status: Some(status),
                body: None,
            })?;
            let body = parse_json_body(&raw);
            Ok(PhaseoResponse {
                status,
                body,
                request_id,
            })
        }
        Err(ureq::Error::Status(status, response)) => {
            let raw = response.into_string().unwrap_or_default();
            let body = parse_json_body(&raw);
            let message = body
                .pointer("/error/message")
                .and_then(Value::as_str)
                .or_else(|| body.get("message").and_then(Value::as_str))
                .unwrap_or("Phaseo returned an error")
                .to_string();
            Err(PhaseoError {
                message,
                status: Some(status),
                body: Some(body),
            })
        }
        Err(ureq::Error::Transport(error)) => Err(PhaseoError {
            message: format!("Phaseo transport error: {error}"),
            status: None,
            body: None,
        }),
    }
}

fn parse_json_body(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
