use std::collections::HashMap;

use phaseo_rust_sdk::gen::client::{Client, Response, Transport};
use phaseo_rust_sdk::gen::operations;

struct HttpTransport;

impl Transport for HttpTransport {
    fn request(
        &self,
        method: &str,
        url: &str,
        body: Option<&str>,
        headers: &HashMap<String, String>,
    ) -> Result<Response, String> {
        let mut req = ureq::request(method, url);
        for (key, value) in headers {
            req = req.set(key, value);
        }
        let resp = if let Some(payload) = body {
            req.set("Content-Type", "application/json")
                .send_string(payload)
        } else {
            req.call()
        };
        match resp {
            Ok(response) => {
                let status = response.status();
                let body = response.into_string().unwrap_or_default();
                Ok(Response {
                    status: status as u16,
                    body,
                })
            }
            Err(err) => Err(err.to_string()),
        }
    }
}

#[test]
fn smoke_chat() {
    let api_key = std::env::var("PHASEO_API_KEY").expect("PHASEO_API_KEY is required");
    let base_url = std::env::var("PHASEO_BASE_URL")
        .unwrap_or_else(|_| "https://api.phaseo.app/v1".to_string());
    let model = std::env::var("PHASEO_SMOKE_MODEL")
        .unwrap_or_else(|_| "openai/gpt-5.4-nano".to_string());
    let input = std::env::var("PHASEO_SMOKE_INPUT").unwrap_or_else(|_| "Hi".to_string());

    let transport = HttpTransport;
    let mut client = Client::new(base_url, transport);
    client
        .headers
        .insert("Authorization".to_string(), format!("Bearer {}", api_key));

    let payload = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": input }]
    });
    let response = operations::createChatCompletion(&client, &HashMap::new(), Some(&payload.to_string()))
        .expect("request failed");

    let parsed: serde_json::Value = serde_json::from_str(&response.body).expect("invalid JSON");
    println!("{}", serde_json::to_string_pretty(&parsed).unwrap());
}
