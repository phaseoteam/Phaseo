//! Realtime voice sessions over the Phaseo relay WebSocket (feature `realtime`).
//!
//! `client.realtime().connect(..)` creates the session, opens the relay socket and waits for
//! `relay.connected`. Provider events pass through unchanged as [`serde_json::Value`]s, and
//! [`RealtimeSession::end`] sends `session.end` and returns the `session.ended` final bill.

use std::collections::HashMap;
use std::fmt;
use std::io::ErrorKind;
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};
use tungstenite::client::IntoClientRequest;
use tungstenite::http::HeaderValue;
use tungstenite::protocol::frame::coding::CloseCode;
use tungstenite::protocol::CloseFrame;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};
use url::Url;

use crate::{Phaseo, PhaseoError};

/// The relay echoes this protocol back; WebSocket clients need one selected.
const RELAY_PROTOCOL: &str = "statsync-realtime";
/// How often the reader releases the socket so sends can go out.
const READ_SLICE: Duration = Duration::from_millis(10);

type Listener = Arc<dyn Fn(&Value) + Send + Sync>;
type Socket = WebSocket<MaybeTlsStream<TcpStream>>;

/// Options for [`Realtime::connect`].
#[derive(Clone, Debug)]
pub struct RealtimeOptions {
    pub model: String,
    pub voice: Option<String>,
    pub instructions: Option<String>,
    pub provider: Option<String>,
    pub metadata: Option<Value>,
    /// How long to wait for `relay.connected`. Default 30 seconds.
    pub connect_timeout: Duration,
}

impl RealtimeOptions {
    pub fn new(model: impl Into<String>) -> Self {
        Self {
            model: model.into(),
            voice: None,
            instructions: None,
            provider: None,
            metadata: None,
            connect_timeout: Duration::from_secs(30),
        }
    }

    pub fn voice(mut self, voice: impl Into<String>) -> Self {
        self.voice = Some(voice.into());
        self
    }

    pub fn instructions(mut self, instructions: impl Into<String>) -> Self {
        self.instructions = Some(instructions.into());
        self
    }
}

/// Options for [`RealtimeSession::end`].
#[derive(Clone, Debug)]
pub struct EndOptions {
    /// Your own note, echoed back as `client_reason`.
    pub reason: Option<String>,
    /// `Some(false)` lets a reply that is still playing finish. `None` uses the relay default (`true`).
    pub cancel_response: Option<bool>,
    /// How long to wait for `session.ended`. Default 60 seconds.
    pub timeout: Duration,
}

impl Default for EndOptions {
    fn default() -> Self {
        Self { reason: None, cancel_response: None, timeout: Duration::from_secs(60) }
    }
}

/// Errors from realtime sessions.
#[derive(Clone, Debug)]
pub enum RealtimeError {
    /// Creating the session failed.
    Http(PhaseoError),
    /// The WebSocket could not be opened or written to.
    WebSocket(String),
    /// The socket closed, or `end` timed out, without `session.ended`. The call is still billed;
    /// `final_bill_path` returns the cost once it is settled.
    Closed { session_id: String, close_code: Option<u16>, detail: String, final_bill_path: String },
    /// The relay sent `session.ended` before `relay.connected`.
    EndedBeforeConnecting { session_id: String, reason: String },
    /// `relay.connected` did not arrive in time.
    ConnectTimeout { session_id: String },
}

impl fmt::Display for RealtimeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Http(error) => write!(f, "realtime session request failed: {}", error.message),
            Self::WebSocket(message) => write!(f, "realtime WebSocket error: {message}"),
            Self::Closed { session_id, detail, final_bill_path, .. } => write!(
                f,
                "realtime session {session_id} {detail} without session.ended; the call is still billed, fetch the final bill with GET {final_bill_path}"
            ),
            Self::EndedBeforeConnecting { session_id, reason } => {
                write!(f, "realtime session {session_id} ended before connecting: {reason}")
            }
            Self::ConnectTimeout { session_id } => write!(f, "realtime session {session_id} did not connect in time"),
        }
    }
}

impl std::error::Error for RealtimeError {}

/// `/v1/generations?id=realtime%3A<session_id>`: send it as a GET for the final bill once settled.
pub fn final_bill_path(session_id: &str) -> String {
    let encoded: String = url::form_urlencoded::byte_serialize(format!("realtime:{session_id}").as_bytes()).collect();
    format!("/v1/generations?id={encoded}")
}

/// Resolves the session's `connect.url` against the base URL as `ws://` or `wss://`.
pub fn relay_url(base_url: &str, connect_url: &str) -> Result<String, RealtimeError> {
    let base = Url::parse(&format!("{}/", base_url.trim_end_matches('/'))).map_err(|error| RealtimeError::WebSocket(error.to_string()))?;
    let mut resolved = base.join(connect_url).map_err(|error| RealtimeError::WebSocket(error.to_string()))?;
    let scheme = match resolved.scheme() {
        "https" => "wss",
        "http" => "ws",
        other => return Ok(if other == "wss" || other == "ws" { resolved.to_string() } else { connect_url.to_string() }),
    };
    resolved.set_scheme(scheme).map_err(|_| RealtimeError::WebSocket("invalid relay URL".to_string()))?;
    Ok(resolved.to_string())
}

/// `client.realtime()`: realtime voice sessions (beta).
pub struct Realtime<'a> {
    client: &'a Phaseo,
}

impl Phaseo {
    /// Realtime voice sessions (beta). Needs the `realtime` feature.
    pub fn realtime(&self) -> Realtime<'_> {
        Realtime { client: self }
    }
}

impl Realtime<'_> {
    /// Creates the session, opens the relay socket and waits for `relay.connected`.
    pub fn connect(&self, options: RealtimeOptions) -> Result<RealtimeSession, RealtimeError> {
        let mut body = Map::new();
        body.insert("model".into(), Value::String(options.model.clone()));
        for (key, value) in [("voice", &options.voice), ("instructions", &options.instructions), ("provider", &options.provider)] {
            if let Some(value) = value {
                body.insert(key.into(), Value::String(value.clone()));
            }
        }
        if let Some(metadata) = &options.metadata {
            body.insert("metadata".into(), metadata.clone());
        }
        let info = self.client.post("/audio/realtime/sessions", &Value::Object(body)).map_err(RealtimeError::Http)?.body;
        let text = |value: Option<&Value>| value.and_then(Value::as_str).unwrap_or_default().to_string();
        let secret = text(info.get("client_secret"));
        let mut session_id = text(info.get("session_id"));
        if session_id.is_empty() {
            session_id = text(info.get("id"));
        }
        let connect_url = text(info.get("connect").and_then(|connect| connect.get("url")));
        if secret.is_empty() || session_id.is_empty() || connect_url.is_empty() {
            return Err(RealtimeError::WebSocket("session response is missing session_id, client_secret or connect.url".into()));
        }
        let url = relay_url(self.client.base_url(), &connect_url)?;
        let mut request = url.into_client_request().map_err(|error| RealtimeError::WebSocket(error.to_string()))?;
        let protocols = HeaderValue::from_str(&format!("{RELAY_PROTOCOL}, rtsec.{secret}"))
            .map_err(|error| RealtimeError::WebSocket(error.to_string()))?;
        request.headers_mut().insert("Sec-WebSocket-Protocol", protocols);
        let (mut socket, _) = tungstenite::connect(request).map_err(|error| RealtimeError::WebSocket(error.to_string()))?;
        let stream = match socket.get_mut() {
            MaybeTlsStream::Plain(stream) => stream,
            MaybeTlsStream::Rustls(stream) => stream.get_mut(),
            _ => return Err(RealtimeError::WebSocket("unsupported TLS stream".into())),
        };
        stream.set_read_timeout(Some(READ_SLICE)).map_err(|error| RealtimeError::WebSocket(error.to_string()))?;

        let mut public_info = info.clone();
        if let Some(object) = public_info.as_object_mut() {
            object.remove("client_secret");
            object.remove("clientSecret");
        }
        let inner = Arc::new(Inner {
            session_id: session_id.clone(),
            socket: Mutex::new(socket),
            pending_writes: AtomicUsize::new(0),
            listeners: Mutex::new(HashMap::new()),
            next_listener: AtomicUsize::new(0),
            subscribers: Mutex::new(Vec::new()),
            state: Mutex::new(State::default()),
            changed: Condvar::new(),
            stop: AtomicBool::new(false),
        });
        let reader = Arc::clone(&inner);
        thread::spawn(move || reader.read_loop());
        let session = RealtimeSession { id: session_id.clone(), info: public_info, inner };
        let deadline = Instant::now() + options.connect_timeout;
        let mut state = session.inner.state.lock().unwrap();
        loop {
            if state.connected {
                drop(state);
                return Ok(session);
            }
            if let Some(outcome) = &state.outcome {
                let error = match outcome {
                    Ok(ended) => RealtimeError::EndedBeforeConnecting {
                        session_id,
                        reason: ended.get("reason").and_then(Value::as_str).unwrap_or_default().to_string(),
                    },
                    Err(error) => error.clone(),
                };
                drop(state);
                return Err(error);
            }
            let now = Instant::now();
            if now >= deadline {
                drop(state);
                session.close();
                return Err(RealtimeError::ConnectTimeout { session_id });
            }
            state = session.inner.changed.wait_timeout(state, deadline - now).unwrap().0;
        }
    }
}

#[derive(Default)]
struct State {
    connected: bool,
    outcome: Option<Result<Value, RealtimeError>>,
}

struct Inner {
    session_id: String,
    socket: Mutex<Socket>,
    pending_writes: AtomicUsize,
    listeners: Mutex<HashMap<String, Vec<(usize, Listener)>>>,
    next_listener: AtomicUsize,
    subscribers: Mutex<Vec<Sender<Value>>>,
    state: Mutex<State>,
    changed: Condvar,
    stop: AtomicBool,
}

impl Inner {
    fn read_loop(&self) {
        let mut close_code: Option<u16> = None;
        loop {
            if self.stop.load(Ordering::SeqCst) {
                return;
            }
            if self.pending_writes.load(Ordering::SeqCst) > 0 {
                thread::sleep(Duration::from_millis(1));
            }
            let result = self.socket.lock().unwrap().read();
            match result {
                Ok(Message::Text(text)) => {
                    if let Ok(event) = serde_json::from_str::<Value>(text.as_str()) {
                        self.dispatch(event);
                    }
                }
                Ok(Message::Close(frame)) => close_code = frame.map(|frame| u16::from(frame.code)),
                Ok(_) => {}
                Err(tungstenite::Error::Io(error)) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
                Err(tungstenite::Error::ConnectionClosed) | Err(tungstenite::Error::AlreadyClosed) => {
                    let detail = match close_code {
                        Some(code) => format!("closed (code {code})"),
                        None => "closed".to_string(),
                    };
                    self.finish(Err(self.closed(close_code, detail)));
                    return;
                }
                Err(error) => {
                    self.finish(Err(self.closed(close_code, format!("closed ({error})"))));
                    return;
                }
            }
        }
    }

    fn closed(&self, close_code: Option<u16>, detail: String) -> RealtimeError {
        RealtimeError::Closed {
            session_id: self.session_id.clone(),
            close_code,
            detail,
            final_bill_path: final_bill_path(&self.session_id),
        }
    }

    fn dispatch(&self, event: Value) {
        let Some(kind) = event.get("type").and_then(Value::as_str).map(str::to_string) else {
            return;
        };
        let listeners: Vec<Listener> = {
            let map = self.listeners.lock().unwrap();
            [kind.as_str(), "*"]
                .iter()
                .flat_map(|key| map.get(*key).into_iter().flatten().map(|(_, listener)| Arc::clone(listener)))
                .collect()
        };
        for listener in listeners {
            // Listener panics must not break the session.
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| listener(&event)));
        }
        self.subscribers.lock().unwrap().retain(|sender| sender.send(event.clone()).is_ok());
        if kind == "relay.connected" {
            self.state.lock().unwrap().connected = true;
            self.changed.notify_all();
        } else if kind == "session.ended" {
            self.finish(Ok(event));
        }
    }

    fn finish(&self, outcome: Result<Value, RealtimeError>) {
        let mut state = self.state.lock().unwrap();
        if state.outcome.is_none() {
            state.outcome = Some(outcome);
            // Dropping the senders ends every events() iterator.
            self.subscribers.lock().unwrap().clear();
        }
        drop(state);
        self.changed.notify_all();
    }

    fn write(&self, text: String) -> Result<(), RealtimeError> {
        self.pending_writes.fetch_add(1, Ordering::SeqCst);
        let result = self.socket.lock().unwrap().send(Message::text(text));
        self.pending_writes.fetch_sub(1, Ordering::SeqCst);
        result.map_err(|error| RealtimeError::WebSocket(error.to_string()))
    }
}

/// A connected realtime voice call.
pub struct RealtimeSession {
    /// The realtime session ID.
    pub id: String,
    /// The create-session response, without `client_secret`.
    pub info: Value,
    inner: Arc<Inner>,
}

impl RealtimeSession {
    /// Sends PCM16 microphone audio (24 kHz for OpenAI and xAI, 16 kHz for Google) as `client.audio`.
    pub fn send_audio(&self, pcm16: &[u8]) -> Result<(), RealtimeError> {
        self.send(&json!({ "type": "client.audio", "audio": base64(pcm16) }))
    }

    /// Sends any event as JSON, for provider-specific messages.
    pub fn send(&self, event: &Value) -> Result<(), RealtimeError> {
        if self.inner.state.lock().unwrap().outcome.is_some() {
            return Err(RealtimeError::WebSocket(format!("realtime session {} is not open", self.id)));
        }
        self.inner.write(event.to_string())
    }

    /// Subscribes to one event type, or every event with `"*"`. Returns an ID for [`RealtimeSession::off`].
    /// Listeners run on the reader thread; keep them quick.
    pub fn on(&self, event_type: &str, listener: impl Fn(&Value) + Send + Sync + 'static) -> usize {
        let id = self.inner.next_listener.fetch_add(1, Ordering::SeqCst);
        self.inner.listeners.lock().unwrap().entry(event_type.to_string()).or_default().push((id, Arc::new(listener)));
        id
    }

    /// Removes a listener added with [`RealtimeSession::on`].
    pub fn off(&self, listener_id: usize) {
        for listeners in self.inner.listeners.lock().unwrap().values_mut() {
            listeners.retain(|(id, _)| *id != listener_id);
        }
    }

    /// Subscribes to `session.warning`.
    pub fn on_warning(&self, listener: impl Fn(&Value) + Send + Sync + 'static) -> usize {
        self.on("session.warning", listener)
    }

    /// Subscribes to `session.ended`.
    pub fn on_ended(&self, listener: impl Fn(&Value) + Send + Sync + 'static) -> usize {
        self.on("session.ended", listener)
    }

    /// Every event from now until the socket closes. Iterating blocks while waiting.
    pub fn events(&self) -> Receiver<Value> {
        let (sender, receiver) = channel();
        let state = self.inner.state.lock().unwrap();
        if state.outcome.is_none() {
            self.inner.subscribers.lock().unwrap().push(sender);
        }
        receiver
    }

    /// Sends `session.end` and returns `session.ended`: reason, initiated_by, duration_seconds, usage,
    /// cost, billing_status and, unless settled, final_bill. Returns [`RealtimeError::Closed`] if the
    /// socket closes, or the timeout passes, without it.
    pub fn end(&self, options: EndOptions) -> Result<Value, RealtimeError> {
        let mut message = json!({ "type": "session.end" });
        if let Some(reason) = options.reason {
            message["reason"] = Value::String(reason);
        }
        if let Some(cancel) = options.cancel_response {
            message["cancel_response"] = Value::Bool(cancel);
        }
        // A send failure means the socket is closing; the reader reports how it ended.
        let _ = self.send(&message);
        match self.wait(options.timeout) {
            Some(outcome) => outcome,
            None => {
                let detail = format!("timed out after {} ms", options.timeout.as_millis());
                self.inner.finish(Err(self.inner.closed(None, detail)));
                self.close();
                self.wait(Duration::ZERO).expect("outcome was just set")
            }
        }
    }

    /// Waits up to `timeout` for the call to end however it ends. `None` if it is still running.
    pub fn wait(&self, timeout: Duration) -> Option<Result<Value, RealtimeError>> {
        let deadline = Instant::now() + timeout;
        let mut state = self.inner.state.lock().unwrap();
        loop {
            if let Some(outcome) = &state.outcome {
                return Some(outcome.clone());
            }
            let now = Instant::now();
            if now >= deadline {
                return None;
            }
            state = self.inner.changed.wait_timeout(state, deadline - now).unwrap().0;
        }
    }

    /// Closes the socket without waiting for the bill. The call is still billed; prefer [`RealtimeSession::end`].
    pub fn close(&self) {
        self.inner.pending_writes.fetch_add(1, Ordering::SeqCst);
        let _ = self.inner.socket.lock().unwrap().close(Some(CloseFrame { code: CloseCode::Normal, reason: "client_closed".into() }));
        self.inner.pending_writes.fetch_sub(1, Ordering::SeqCst);
    }
}

impl Drop for RealtimeSession {
    fn drop(&mut self) {
        if self.inner.state.lock().unwrap().outcome.is_none() {
            self.close();
        }
        self.inner.stop.store(true, Ordering::SeqCst);
    }
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let triple = (u32::from(chunk[0]) << 16) | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8) | u32::from(*chunk.get(2).unwrap_or(&0));
        for index in 0..4 {
            if index <= chunk.len() {
                output.push(TABLE[((triple >> (18 - index * 6)) & 0x3f) as usize] as char);
            } else {
                output.push('=');
            }
        }
    }
    output
}
