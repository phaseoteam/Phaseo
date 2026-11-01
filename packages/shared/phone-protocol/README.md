# @phaseo/phone-protocol

What the Phaseo desktop app and the Phaseo phone app say to each other, shared by both (source, not a build, like `@phaseo/app-kit`). The same frames travel over a direct WebSocket (same Wi-Fi or a Tailscale tailnet) and, inside end-to-end encrypted envelopes, over Phaseo Connect.

| File | What it is |
|---|---|
| `src/frames.ts` | Frame types, `parsePhoneFrame` (desktop side, strict) and `parseDesktopFrame` (phone side), limits, `RequestRate`. |
| `src/pairing.ts` | The QR / `phaseo://pair?p=` payload, `POST /pair` request and result. |
| `src/envelope.ts` | X25519 keys, HKDF-SHA256 (`phaseo-connect-v1`), XChaCha20-Poly1305 envelopes, `EnvelopeChannel`, `relayPairing`. |
| `src/direct.ts` | The direct connection's key handshake and the sealed `POST /pair`. |
| `src/relay.ts` | Phaseo Connect's wire protocol: envelope routing, `hold`, the relay's own frames, refusals, close codes and URLs. No crypto, so the relay Worker imports it alone as `@phaseo/phone-protocol/relay`. |

## Direct connection

Direct addresses are plain `http`/`ws` (a Wi-Fi or Tailscale IP has no certificate), so everything secret or private is sealed with the paired keys and no token is sent. `src/direct.ts` describes the handshake.

1. Pair: `POST {direct url}/pair` with `sealPairRequest(phonePrivateKey, desktopPublicKey, PairRequest)`; open the answer with `openPairResponse` to get a `PairResult` (`deviceId`, `relayToken`). The pairing code works once, for ten minutes.
2. Check a URL answers: `GET {direct url}/v1/phone/health` returns `{ ok: true, desktopId }` without signing in.
3. Connect: WebSocket `{direct url}/v1/phone` (`http` → `ws`, `https` → `wss`), with no credentials. The desktop sends `{ type: "challenge" }`; answer with `directAuth(channel, challenge)` on `new EnvelopeChannel(sharedKey(devicePrivateKey, desktopPublicKey), deviceId, relayDesktopAddress)`, check the first envelope back with `checkDirectWelcome`, then seal and open every frame on that channel. Send `hello` first. Close code 4401 means the desktop doesn't know this phone or it was removed.

## Phaseo Connect

- The phone connects to `relayPhoneUrl(relayUrl, desktopId)` with `Authorization: Bearer <relayToken>` and exchanges `Envelope`s addressed `from: deviceId`, `to: relayDesktopAddress` (`"desktop"`). The relay sets `from` from the sign-in, so seal with exactly those names: `new EnvelopeChannel(sharedKey(devicePrivateKey, desktopPublicKey), deviceId, relayDesktopAddress)`.
- Pairing over Connect: `relayPairing(pairingCode)` gives a relay token and a pseudo device id (`pair-…`). The phone signs in with that token and sends one envelope from that pseudo id, with `senderPublicKey` set to its public key, holding `{ id, type: "pair", pairingCode, deviceName, devicePublicKey }`. The answer is a normal response whose result is a `PairResult`. The relay then closes the pairing socket (4001), and the phone reconnects with its own relay token.
- Mark an envelope `hold: true` when `relayHolds(frame)` is true (attention, and the phone's `send` and `answer_*`); the relay keeps those for an offline recipient and drops the rest.
- A refused desktop sign-in is an HTTP status with `{ error }` (`RelayRefusal`). A phone's WebSocket can't read a status, so the relay accepts a refused phone and closes it at once with a code and reason (`relayCloseCodes`):
  - 4001 `unauthorized`: the desktop doesn't know this token, or removed the phone. Pair again.
  - 4402 `connect_off` or `payment_required`: show it and stop retrying.
  - 4503 `entitlement_unavailable`: the relay couldn't check the workspace just now. Say so and keep retrying.

## React Native

The noble libraries need `crypto.getRandomValues`. Install a polyfill (for example `expo-crypto`'s) before importing this package.
