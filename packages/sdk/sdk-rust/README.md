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

## Trusted workloads (OIDC tokens instead of an API key)

Workspaces in the trusted workloads beta can let GitHub Actions jobs and Vercel deployments call Phaseo with their short-lived OIDC token instead of an API key. Set up a trust policy in Settings → API Keys → Trusted workloads, then build the client with `Phaseo::from_api_key_provider`. The provider is called before every request and retry, so each request uses a current token. Tokens must be issued for the audience `https://api.phaseo.app`.

In GitHub Actions (the job needs `permissions: id-token: write`):

```rust
use phaseo::{auth, Phaseo};

let client = Phaseo::from_api_key_provider(auth::github_actions_token());
```

On Vercel, `vercel_token` exchanges the deployment's OIDC token (from `VERCEL_OIDC_TOKEN_FILE` or `VERCEL_OIDC_TOKEN`) for one issued to Phaseo:

```rust
use phaseo::{auth, Phaseo};

let client = Phaseo::from_api_key_provider(auth::vercel_token());

// Or pass the token from the request you are handling:
let client = Phaseo::from_api_key_provider(
    auth::VercelToken::new().source_token(oidc_header_value).into_provider(),
);
```

Both helpers reuse a token until 60 seconds before it expires. Use `.audience(..)` on `GitHubActionsToken` or `VercelToken` to request a different audience. Any `Arc<dyn Fn() -> Result<String, Box<dyn Error + Send + Sync>> + Send + Sync>` works as a provider; an empty credential or an error fails the request before it is sent, and a request that sets its own `Authorization` header keeps it.

## Realtime voice (beta)

Enable the `realtime` feature (`phaseo = { version = "...", features = ["realtime"] }`), which adds `tungstenite`. `client.realtime().connect(..)` creates a realtime session and opens the relay WebSocket. Provider events pass through unchanged as `serde_json::Value`s.

```rust
use phaseo::realtime::{EndOptions, RealtimeOptions};

let session = client.realtime().connect(RealtimeOptions::new("openai/gpt-realtime-2").voice("marin"))?;
session.on_warning(|warning| eprintln!("{}", warning["code"]));
let events = session.events(); // every event until the socket closes
let reader = std::thread::spawn(move || {
    for event in events {
        println!("{}", event["type"]);
    }
});
session.send_audio(&pcm16_chunk)?; // PCM16 bytes; base64 is handled for you
let ended = session.end(EndOptions { reason: Some("caller hung up".into()), ..EndOptions::default() })?;
reader.join().unwrap();
```

`events()` queues every event, audio deltas included, until you receive it, so drain the receiver as above or drop it once you're done. Use `session.on(..)` if you only need a few event types.

If the socket closes without `session.ended`, `end` returns `RealtimeError::Closed`, whose `final_bill_path` is the `GET /v1/generations?id=realtime%3A<session_id>` lookup for the final cost.

## Development

```bash
rustfmt --check packages/sdk/sdk-rust/src/phaseo.rs packages/sdk/sdk-rust/tests/*.rs
cargo clippy --manifest-path packages/sdk/sdk-rust/Cargo.toml --all-targets --features realtime -- -D warnings
cargo test --manifest-path packages/sdk/sdk-rust/Cargo.toml --all-targets --features realtime
cargo package --manifest-path packages/sdk/sdk-rust/Cargo.toml
```

Live gateway smoke tests are opt-in with `PHASEO_RUST_LIVE_SMOKE=true`.
