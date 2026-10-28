#![cfg(feature = "realtime")]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use phaseo::realtime::{relay_url, EndOptions, RealtimeError, RealtimeOptions};
use phaseo::Phaseo;
use serde_json::{json, Value};
use tungstenite::handshake::server::{Request, Response};
use tungstenite::http::HeaderValue;
use tungstenite::protocol::frame::coding::CloseCode;
use tungstenite::protocol::CloseFrame;
use tungstenite::{Message, WebSocket};

fn ended_event() -> Value {
    json!({
        "type": "session.ended", "session_id": "rt_test", "reason": "client_requested", "initiated_by": "client",
        "duration_seconds": 12.5, "usage": { "output_audio_tokens": 200 },
        "cost": { "total_usd": 0.01, "total_nanos": 10000000, "estimated": false, "estimate_basis": null,
                  "debt_nanos": 0, "uncollected_nanos": 0, "currency": "USD" },
        "billing_status": "settled"
    })
}

#[derive(Default)]
struct Seen {
    created: Option<Value>,
    protocols: Option<String>,
    path: Option<String>,
    received: Vec<Value>,
}

type Relay = WebSocket<TcpStream>;

fn receive_until(socket: &mut Relay, seen: &Arc<Mutex<Seen>>, kind: &str) -> bool {
    loop {
        match socket.read() {
            Ok(Message::Text(text)) => {
                let message: Value = serde_json::from_str(text.as_str()).unwrap();
                let matched = message["type"] == kind;
                seen.lock().unwrap().received.push(message);
                if matched {
                    return true;
                }
            }
            Ok(_) => {}
            Err(_) => return false,
        }
    }
}

/// Serves the create-session call and plays the relay with `behaviour`.
fn fake_relay(behaviour: impl FnOnce(&mut Relay, &Arc<Mutex<Seen>>) + Send + 'static) -> (Phaseo, Arc<Mutex<Seen>>, thread::JoinHandle<()>) {
    let api = TcpListener::bind("127.0.0.1:0").unwrap();
    let relay = TcpListener::bind("127.0.0.1:0").unwrap();
    let api_address = api.local_addr().unwrap();
    let relay_port = relay.local_addr().unwrap().port();
    let seen = Arc::new(Mutex::new(Seen::default()));
    let api_seen = Arc::clone(&seen);
    thread::spawn(move || {
        let (mut stream, _) = api.accept().unwrap();
        let mut request = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let size = stream.read(&mut chunk).unwrap();
            request.extend_from_slice(&chunk[..size]);
            let text = String::from_utf8_lossy(&request).to_string();
            if let Some(split) = text.find("\r\n\r\n") {
                let length: usize = text
                    .lines()
                    .find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length:").map(|value| value.trim().parse().unwrap()))
                    .unwrap_or(0);
                if request.len() >= split + 4 + length {
                    api_seen.lock().unwrap().created = serde_json::from_slice(&request[split + 4..split + 4 + length]).ok();
                    break;
                }
            }
        }
        let body = json!({
            "id": "rt_test", "session_id": "rt_test", "client_secret": "rtsec_secret",
            "connect": { "transport": "websocket", "url": format!("ws://127.0.0.1:{relay_port}/v1/realtime/sessions/rt_test/relay") },
            "max_duration_seconds": 3600
        })
        .to_string();
        let response = format!("HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        stream.write_all(response.as_bytes()).unwrap();
    });
    let relay_seen = Arc::clone(&seen);
    let handle = thread::spawn(move || {
        let (stream, _) = relay.accept().unwrap();
        let callback_seen = Arc::clone(&relay_seen);
        // The callback's error type is fixed by tungstenite's accept_hdr signature.
        #[allow(clippy::result_large_err)]
        let mut socket = tungstenite::accept_hdr(stream, move |request: &Request, mut response: Response| {
            let mut seen = callback_seen.lock().unwrap();
            seen.protocols = request.headers().get("Sec-WebSocket-Protocol").map(|value| value.to_str().unwrap().to_string());
            seen.path = Some(request.uri().path().to_string());
            response.headers_mut().insert("Sec-WebSocket-Protocol", HeaderValue::from_static("statsync-realtime"));
            Ok(response)
        })
        .unwrap();
        socket.send(Message::text(r#"{"type":"relay.connected","session_id":"rt_test"}"#)).unwrap();
        behaviour(&mut socket, &relay_seen);
        thread::sleep(Duration::from_millis(100));
    });
    let client = Phaseo::new("sk_test_123").unwrap().with_base_url(format!("http://{api_address}/v1")).unwrap();
    (client, seen, handle)
}

#[test]
fn connect_streams_events_and_end_returns_the_bill() {
    let (client, seen, handle) = fake_relay(|socket, seen| {
        receive_until(socket, seen, "client.audio");
        socket.send(Message::text(r#"{"type":"response.output_audio.delta","delta":"AAA="}"#)).unwrap();
        socket.send(Message::text(r#"{"type":"session.warning","code":"max_duration_approaching","seconds_remaining":120}"#)).unwrap();
        receive_until(socket, seen, "session.end");
        socket.send(Message::text(ended_event().to_string())).unwrap();
        let _ = socket.close(None);
        let _ = socket.flush();
    });
    let session = client.realtime().connect(RealtimeOptions::new("openai/gpt-realtime-2").voice("marin")).unwrap();
    assert_eq!(session.id, "rt_test");
    assert!(session.info.get("client_secret").is_none());
    {
        let seen = seen.lock().unwrap();
        assert_eq!(seen.created.as_ref().unwrap()["voice"], "marin");
        assert_eq!(seen.protocols.as_deref(), Some("statsync-realtime, rtsec.rtsec_secret"));
        assert_eq!(seen.path.as_deref(), Some("/v1/realtime/sessions/rt_test/relay"));
    }
    let warnings = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&warnings);
    session.on_warning(move |event| sink.lock().unwrap().push(event.clone()));
    let events = session.events();
    session.send_audio(&[0, 1, 2, 255]).unwrap();
    let types: Vec<String> = events.iter().take(2).map(|event| event["type"].as_str().unwrap().to_string()).collect();
    assert_eq!(types, ["response.output_audio.delta", "session.warning"]);
    assert_eq!(warnings.lock().unwrap()[0]["seconds_remaining"], 120);

    let ended = session
        .end(EndOptions { reason: Some("caller hung up".into()), cancel_response: Some(false), timeout: Duration::from_secs(5) })
        .unwrap();
    assert_eq!(ended["reason"], "client_requested");
    assert_eq!(ended["cost"]["total_usd"], 0.01);
    handle.join().unwrap();
    let seen = seen.lock().unwrap();
    assert_eq!(seen.received[0]["audio"], "AAEC/w==");
    let last = seen.received.last().unwrap();
    assert_eq!(last["type"], "session.end");
    assert_eq!(last["reason"], "caller hung up");
    assert_eq!(last["cancel_response"], false);
}

#[test]
fn end_returns_closed_error_with_final_bill() {
    let (client, _, handle) = fake_relay(|socket, seen| {
        receive_until(socket, seen, "session.end");
        let _ = socket.close(Some(CloseFrame { code: CloseCode::Error, reason: "realtime_client_socket_error".into() }));
        let _ = socket.flush();
        while socket.read().is_ok() {}
    });
    let session = client.realtime().connect(RealtimeOptions::new("openai/gpt-realtime-2")).unwrap();
    let error = session.end(EndOptions::default()).unwrap_err();
    handle.join().unwrap();
    match &error {
        RealtimeError::Closed { close_code, final_bill_path, .. } => {
            assert_eq!(*close_code, Some(1011));
            assert_eq!(final_bill_path, "/v1/generations?id=realtime%3Art_test");
        }
        other => panic!("expected Closed, got {other:?}"),
    }
    assert!(error.to_string().contains("GET /v1/generations?id=realtime%3Art_test"));
}

#[test]
fn end_times_out() {
    let (client, _, _handle) = fake_relay(|socket, seen| {
        receive_until(socket, seen, "never");
    });
    let session = client.realtime().connect(RealtimeOptions::new("openai/gpt-realtime-2")).unwrap();
    let error = session.end(EndOptions { timeout: Duration::from_millis(100), ..EndOptions::default() }).unwrap_err();
    assert!(error.to_string().contains("timed out after 100 ms"), "{error}");
}

#[test]
fn relay_url_resolves_relative_connect_urls() {
    assert_eq!(
        relay_url("https://api.phaseo.app/v1", "/v1/realtime/sessions/rt_x/relay").unwrap(),
        "wss://api.phaseo.app/v1/realtime/sessions/rt_x/relay"
    );
    assert_eq!(
        relay_url("http://localhost:8787/v1", "/v1/realtime/sessions/rt_x/relay").unwrap(),
        "ws://localhost:8787/v1/realtime/sessions/rt_x/relay"
    );
}
