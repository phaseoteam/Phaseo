# AI Stats Rust SDK

Rust SDK preview for AI Stats Gateway.

This package currently exposes the generated client and operation modules.

## Status

- Preview SDK
- Generated client surface only
- Intended for teams comfortable working directly with generated request and response shapes

## Installation

Use a git dependency until a crates.io release is available:

```toml
[dependencies]
ai-stats-rust-sdk = { git = "https://github.com/AI-Stats/AI-Stats.git", package = "ai-stats-rust-sdk" }
serde_json = "1"
ureq = "2"
```

## Quick start

```rust
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
        for (k, v) in headers {
            req = req.set(k, v);
        }
        let resp = match body {
            Some(payload) => req.set("Content-Type", "application/json").send_string(payload),
            None => req.call(),
        };

        match resp {
            Ok(r) => Ok(Response {
                status: r.status() as u16,
                body: r.into_string().unwrap_or_default(),
            }),
            Err(err) => Err(err.to_string()),
        }
    }
}

fn main() {
    let api_key = std::env::var("AI_STATS_API_KEY").expect("AI_STATS_API_KEY is required");
    let base_url = std::env::var("AI_STATS_BASE_URL")
        .unwrap_or_else(|_| "https://api.phaseo.app/v1".to_string());

    let transport = HttpTransport;
    let mut client = Client::new(base_url, transport);
    client.headers.insert("Authorization".to_string(), format!("Bearer {}", api_key));

    let payload = serde_json::json!({
        "model": "google/gemma-3-27b:free",
        "input": "Reply with: Rust SDK works"
    });

    let response = operations::createResponse(&client, &HashMap::new(), Some(&payload.to_string()))
        .expect("request failed");

    println!("{}", response.body);
}
```

## Environment variables

- `AI_STATS_API_KEY` (required)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:rust`
- Smoke tests:
  - `pnpm --filter @ai-stats/rust-sdk run smoke:chat`
  - `pnpm --filter @ai-stats/rust-sdk run smoke:responses`
