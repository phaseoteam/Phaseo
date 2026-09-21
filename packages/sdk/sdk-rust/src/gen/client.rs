use std::collections::HashMap;
use url::form_urlencoded;

#[derive(Debug)]
pub struct Response {
	pub status: u16,
	pub headers: HashMap<String, String>,
	pub body: String,
}

impl Response {
	pub fn request_id(&self) -> Option<&str> {
		self.headers.get("x-request-id").or_else(|| self.headers.get("request-id")).map(String::as_str)
	}

	pub fn trace_url(&self) -> Option<String> {
		self.request_id().map(|id| format!("https://phaseo.app/settings/usage/logs/requests/{}", form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>()))
	}
}

#[derive(Clone, Debug, Default)]
pub struct RequestOptions {
	pub headers: HashMap<String, String>,
	pub timeout_ms: Option<u64>,
	pub max_retries: Option<u32>,
	pub idempotency_key: Option<String>,
}

pub trait Transport {
	fn request(
		&self,
		method: &str,
		url: &str,
		body: Option<&str>,
		headers: &HashMap<String, String>,
	) -> Result<Response, String>;

	fn request_with_options(
		&self,
		method: &str,
		url: &str,
		body: Option<&str>,
		headers: &HashMap<String, String>,
		options: &RequestOptions,
	) -> Result<Response, String> {
		let mut merged_headers = headers.clone();
		merged_headers.extend(options.headers.clone());
		if let Some(key) = &options.idempotency_key {
			merged_headers.insert("Idempotency-Key".to_string(), key.clone());
		}
		self.request(method, url, body, &merged_headers)
	}
}

pub struct Client<T: Transport> {
	pub base_url: String,
	pub headers: HashMap<String, String>,
	pub transport: T,
}

impl<T: Transport> Client<T> {
	pub fn new(base_url: String, transport: T) -> Self {
		Self {
			base_url: base_url.trim_end_matches('/').to_string(),
			headers: HashMap::new(),
			transport,
		}
	}

	pub fn request(&self, method: &str, path: &str, body: Option<&str>) -> Result<Response, String> {
		let url = format!("{}{}", self.base_url, path);
		self.transport.request(method, &url, body, &self.headers)
	}

	pub fn request_with_options(&self, method: &str, path: &str, body: Option<&str>, options: &RequestOptions) -> Result<Response, String> {
		let url = format!("{}{}", self.base_url, path);
		self.transport.request_with_options(method, &url, body, &self.headers, options)
	}
}
