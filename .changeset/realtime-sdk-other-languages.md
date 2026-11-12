---
"@phaseo/go-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
---

Add a realtime voice client to the Go, Java, C#, PHP, Ruby and Rust SDKs: connect creates a session and opens the relay WebSocket, audio is sent as base64 PCM16 for you, provider events pass through unchanged, and end returns the `session.ended` final bill. Go uses a separate `realtime` package, PHP and Ruby need an optional WebSocket package, and Rust needs the `realtime` feature.
