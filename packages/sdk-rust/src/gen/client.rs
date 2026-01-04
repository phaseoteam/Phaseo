use std::collections::HashMap;

#[derive(Debug)]
pub struct Response {
	pub status: u16,
	pub body: String,
}

pub trait Transport {
	fn request(
		&self,
		method: &str,
		url: &str,
		body: Option<&str>,
		headers: &HashMap<String, String>,
	) -> Result<Response, String>;
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
}
