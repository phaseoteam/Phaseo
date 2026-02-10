use std::collections::HashMap;

use ai_stats_rust_sdk::gen::client::{Client, Response, Transport};
use ai_stats_rust_sdk::gen::operations;

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
fn smoke_responses() {
    let api_key = std::env::var("AI_STATS_API_KEY").expect("AI_STATS_API_KEY is required");
    let base_url = std::env::var("AI_STATS_BASE_URL")
        .unwrap_or_else(|_| "https://api.phaseo.app/v1".to_string());

    let transport = HttpTransport;
    let mut client = Client::new(base_url, transport);
    client
        .headers
        .insert("Authorization".to_string(), format!("Bearer {}", api_key));

    let payload = serde_json::json!({
        "model": "openai/gpt-5-nano",
        "input": "Hi"
    });
    let response = operations::createResponse(&client, &HashMap::new(), Some(&payload.to_string()))
        .expect("request failed");

    let parsed: serde_json::Value = serde_json::from_str(&response.body).expect("invalid JSON");
    println!("{}", serde_json::to_string_pretty(&parsed).unwrap());
}
