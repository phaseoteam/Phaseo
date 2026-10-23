# Phaseo Rust SDK

The official Rust client for [Phaseo Gateway](https://phaseo.app).

## Install

```toml
[dependencies]
phaseo = "0.1"
serde_json = "1"
```

## Quick start

```rust
use phaseo::Phaseo;
use serde_json::json;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Phaseo::from_env()?;
    let response = client.responses(&json!({
        "model": "openai/gpt-5.4-nano",
        "input": "Reply with exactly: Rust SDK works"
    }))?;

    println!("{}", response.body);
    Ok(())
}
```

Set `PHASEO_API_KEY` before running the example. `PHASEO_BASE_URL` can override the default `https://api.phaseo.app/v1` endpoint.

The generated low-level client remains available under `phaseo::gen` for endpoints not yet wrapped by the ergonomic client.

Use `model_endpoint_capabilities` for live provider routes, or `check_model_parameters` to highlight unsupported, partially supported, unknown, and out-of-range values before submitting a request.

```rust
use phaseo::ParameterSupportOptions;
use std::collections::HashMap;

let report = client.check_model_parameters(
    "openai/gpt-5.4",
    &HashMap::from([("temperature".to_string(), json!(0.7))]),
    &ParameterSupportOptions { endpoint: Some("responses".into()), providers: vec![] },
)?;
```

Use `client.preflight_request(...)` to validate a complete request against live
routes. `workflows::Pager` and `workflows::JobHandle` provide lazy pagination and
resumable job polling.

## Realtime voice (beta)

Enable the `realtime` feature (`phaseo = { version = "...", features = ["realtime"] }`), which adds `tungstenite`. `client.realtime().connect(..)` creates a realtime session and opens the relay WebSocket. Provider events pass through unchanged as `serde_json::Value`s.

```rust
use phaseo::realtime::{EndOptions, RealtimeOptions};

let session = client.realtime().connect(RealtimeOptions::new("openai/gpt-realtime-2").voice("marin"))?;
session.on_warning(|warning| eprintln!("{}", warning["code"]));
let events = session.events(); // every event until the socket closes
session.send_audio(&pcm16_chunk)?; // PCM16 bytes; base64 is handled for you
let ended = session.end(EndOptions { reason: Some("caller hung up".into()), ..EndOptions::default() })?;
```

If the socket closes without `session.ended`, `end` returns `RealtimeError::Closed`, whose `final_bill_path` is the `GET /v1/generations?id=realtime%3A<session_id>` lookup for the final cost.

## Development

```bash
rustfmt --check packages/sdk/sdk-rust/src/phaseo.rs packages/sdk/sdk-rust/tests/*.rs
cargo clippy --manifest-path packages/sdk/sdk-rust/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path packages/sdk/sdk-rust/Cargo.toml --all-targets
cargo package --manifest-path packages/sdk/sdk-rust/Cargo.toml
```

Live gateway smoke tests are opt-in with `PHASEO_RUST_LIVE_SMOKE=true`.
