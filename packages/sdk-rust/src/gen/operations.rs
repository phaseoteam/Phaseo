use std::collections::HashMap;
use crate::client::{Client, Response, Transport};

pub fn no_query() -> HashMap<String, String> {
	HashMap::new()
}

pub fn createBatch<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/batches");
	client.request("POST", &resolved_path, body)
}

pub fn createChatCompletion<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/chat/completions");
	client.request("POST", &resolved_path, body)
}

pub fn createEmbedding<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/embeddings");
	client.request("POST", &resolved_path, body)
}

pub fn createImage<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/images/generations");
	client.request("POST", &resolved_path, body)
}

pub fn createImageEdit<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/images/edits");
	client.request("POST", &resolved_path, body)
}

pub fn createModeration<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/moderations");
	client.request("POST", &resolved_path, body)
}

pub fn createResponse<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/responses");
	client.request("POST", &resolved_path, body)
}

pub fn createSpeech<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/speech");
	client.request("POST", &resolved_path, body)
}

pub fn createTranscription<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/transcriptions");
	client.request("POST", &resolved_path, body)
}

pub fn createTranslation<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/audio/translations");
	client.request("POST", &resolved_path, body)
}

pub fn createVideo<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/videos");
	client.request("POST", &resolved_path, body)
}

pub fn getAnalytics<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/analytics");
	client.request("POST", &resolved_path, body)
}

pub fn getGeneration<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/generation");
	client.request("GET", &resolved_path, body)
}

pub fn healthz<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/healthz");
	client.request("GET", &resolved_path, body)
}

pub fn listFiles<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/files");
	client.request("GET", &resolved_path, body)
}

pub fn listModels<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/models");
	client.request("GET", &resolved_path, body)
}

pub fn retrieveBatch<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/batches/") + path.get("batch_id").cloned().unwrap_or_default();
	client.request("GET", &resolved_path, body)
}

pub fn retrieveFile<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/files/") + path.get("file_id").cloned().unwrap_or_default();
	client.request("GET", &resolved_path, body)
}

pub fn root<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/");
	client.request("GET", &resolved_path, body)
}

pub fn uploadFile<T: Transport>(client: &Client<T>, path: &HashMap<String, String>, body: Option<&str>) -> Result<Response, String> {
	let resolved_path = String::from("/files");
	client.request("POST", &resolved_path, body)
}
