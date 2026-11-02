# @phaseo/phone-protocol

What the Phaseo desktop app and the Phaseo phone app say to each other, shared by both (source, not a build, like `@phaseo/app-kit`). The same frames travel over a direct WebSocket (same Wi-Fi or a Tailscale tailnet) and, inside end-to-end encrypted envelopes, over Phaseo Connect.

| File | What it is |
|---|---|
| `src/frames.ts` | Frame types, `parsePhoneFrame` (desktop side, strict) and `parseDesktopFrame` (phone side), limits, `RequestRate`. |
| `src/pairing.ts` | The QR / `phaseo://pair?p=` payload, `POST /pair` request and result. |
| `src/envelope.ts` | X25519 keys, HKDF-SHA256 (`phaseo-connect-v1`), XChaCha20-Poly1305 envelopes, `EnvelopeChannel`, `relayPairing`. |
| `src/direct.ts` | The direct connection's key handshake and the sealed `POST /pair`. |
| `src/relay.ts` | Phaseo Connect's wire protocol: envelope routing, `hold`, the relay's own frames, refusals, close codes and URLs. No crypto, so the relay Worker imports it alone as `@phaseo/phone-protocol/relay`. |

## Models for a new chat

A phone can't change the model of a chat that exists. For a new one, `list_models` (with the `projectId` the chat will use and its `mode`) answers as the computer's own new-chat picker would:

- `agents`: every agent the chat could run on. Phaseo (`source: "phaseo"`, with the computer's Phaseo account as `accountId`) when an account can call the gateway, then each coding agent installed and signed in on the computer (`source: "local"`). Grok only outside Chat, and none the project turns off. Each lists its models with their efforts; `legacy` models belong behind "N older". An agent whose models couldn't be read has `error` and no models, and the rest still list.
- `selected`: the agent, model and effort the chat starts with unasked. In a project (Code or Plan), the project's default model. Otherwise the model the person last chose in the window (their default, else the last picked). Otherwise the Phaseo account's default. With none of these, the picker opens on the first model listed.
- `favourites`: the window's starred models as `harness:model` keys. `permissionMode`: what the chat runs with, the project's default, else the latest chat's. The phone shows it and can't change it.
- `models`: the selected agent's models again, for phones from before agents.

`new_chat` names the agent (`harness`, and `accountId` for Phaseo) with one of its `model` ids and one of that model's effort ids as `reasoningEffort`; the computer refuses anything it didn't list. Without `harness` the model must be the default agent's, and leaving out the model too keeps the computer's choice (refused only when nothing above applies). A computer from before `list_models` answers it with `invalid_frame`, and one from before agents ignores `mode` and sends only `models` and `selected`.

List rows carry `model`, `branch` (the worktree's) and `settled`; `read_chat`'s chat adds `reasoningEffort` when the chat set one. `effortLabel(id)` gives the word both apps show for an effort.

## Versions and projects

`hello` carries the phone's `phoneProtocolVersion` as `protocol`, and the computer answers with the lower of the two, so a phone from before version 2 (which sends none and refuses a higher answer) is told 1 and keeps working. A phone shows a newer feature only when the answer is high enough; an older computer answers an unknown request with `invalid_frame`. From 2, `hello` also lists `capabilities`, the powers this phone has beyond threads (none yet).

`list_projects` (version 2) returns every project, pinned first in the window's order: `repository` says whether it is a git checkout, archived projects are marked `archived`, and a worktree names its source as `worktreeOf` (its chats list under the source, as rows already say). Removed worktrees and Factory's per-item worktrees are left out. Once a phone has read the list, the computer sends `projects_changed` with the whole list whenever it changes; phones that never asked never get it.

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
