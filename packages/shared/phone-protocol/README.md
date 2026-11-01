# @phaseo/phone-protocol

What the Phaseo desktop app and the Phaseo phone app say to each other, shared by both (source, not a build, like `@phaseo/app-kit`). The same frames travel over a direct WebSocket (same Wi-Fi or a Tailscale tailnet) and, inside end-to-end encrypted envelopes, over Phaseo Connect.

| File | What it is |
|---|---|
| `src/frames.ts` | Frame types, `parsePhoneFrame` (desktop side, strict) and `parseDesktopFrame` (phone side), limits, `RequestRate`. |
| `src/pairing.ts` | The QR / `phaseo://pair?p=` payload, `POST /pair` request and result. |
| `src/envelope.ts` | X25519 keys, HKDF-SHA256 (`phaseo-connect-v1`), XChaCha20-Poly1305 envelopes, `EnvelopeChannel`, `relayPairing`. |
| `src/relay.ts` | The relay's own frames (`register_device`, `remove_device`, errors) and its URLs. |

## Direct connection

1. Pair: `POST {direct url}/pair` with `PairRequest` returns `PairResult` (`deviceId`, `deviceToken`, `relayToken`). The pairing code works once, for ten minutes.
2. Check a URL answers: `GET {direct url}/v1/phone/health` returns `{ ok: true, desktopId }` without signing in.
3. Connect: WebSocket `{direct url}/v1/phone` (`http` → `ws`, `https` → `wss`) with `Authorization: Bearer <deviceToken>`. Send `hello` first.

## Phaseo Connect

- The phone connects to `relayPhoneUrl(relayUrl, desktopId)` with `Authorization: Bearer <relayToken>` and exchanges `Envelope`s addressed `from: deviceId`, `to: desktopId`. Seal and open them with `new EnvelopeChannel(sharedKey(devicePrivateKey, desktopPublicKey), deviceId, desktopId)`.
- Pairing over Connect: `relayPairing(pairingCode)` gives a relay token and a pseudo device id. The phone signs in with that token and sends one envelope from that pseudo id, with `senderPublicKey` set to its public key, holding `{ id, type: "pair", pairingCode, deviceName, devicePublicKey }`. The answer is a normal response whose result is a `PairResult`. After that the phone reconnects with its own relay token.
- The relay forwards envelopes unchanged. It holds those the sender marks `hold: true` (attention, and the phone's `send` and `answer_*`) for an offline device.

## React Native

The noble libraries need `crypto.getRandomValues`. Install a polyfill (for example `expo-crypto`'s) before importing this package.
