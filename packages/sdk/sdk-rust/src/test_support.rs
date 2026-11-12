//! A one-request-per-connection HTTP server for unit tests.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

pub(crate) type Captured = Arc<Mutex<Vec<String>>>;

/// Serves `responses` in order, one per connection, and records each raw request.
pub(crate) fn serve(responses: Vec<String>) -> (String, Captured, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let captured: Captured = Arc::new(Mutex::new(Vec::new()));
    let server_captured = Arc::clone(&captured);
    let server = thread::spawn(move || {
        for response in responses {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            loop {
                let mut chunk = [0_u8; 1024];
                let size = stream.read(&mut chunk).unwrap();
                if size == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..size]);
                let text = String::from_utf8_lossy(&request);
                let Some(header_end) = text.find("\r\n\r\n") else {
                    continue;
                };
                let content_length = text[..header_end]
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|value| value.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }
            server_captured
                .lock()
                .unwrap()
                .push(String::from_utf8_lossy(&request).to_string());
            stream.write_all(response.as_bytes()).unwrap();
        }
    });
    (base, captured, server)
}

/// Returns every value of a header in a raw request, matching the name case-insensitively.
pub(crate) fn headers(request: &str, name: &str) -> Vec<String> {
    let head = request.split("\r\n\r\n").next().unwrap_or("");
    head.lines()
        .skip(1)
        .filter_map(|line| line.split_once(':'))
        .filter(|(key, _)| key.trim().eq_ignore_ascii_case(name))
        .map(|(_, value)| value.trim().to_string())
        .collect()
}

pub(crate) fn header(request: &str, name: &str) -> Option<String> {
    headers(request, name).into_iter().next()
}
