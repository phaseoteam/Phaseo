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

For a new chat, `list_models` (with the `projectId` the chat will use and its `mode`) answers as the computer's own new-chat picker would:

- `agents`: every agent the chat could run on. Phaseo (`source: "phaseo"`, with the computer's Phaseo account as `accountId`) when an account can call the gateway, then each coding agent installed and signed in on the computer (`source: "local"`). Grok only outside Chat, and none the project turns off. Each lists its models with their efforts; `legacy` models belong behind "N older". An agent whose models couldn't be read has `error` and no models, and the rest still list.
- `selected`: the agent, model and effort the chat starts with unasked. In a project (Code or Plan), the project's default model. Otherwise the model the person last chose in the window (their default, else the last picked). Otherwise the Phaseo account's default. With none of these, the picker opens on the first model listed.
- `favourites`: the window's starred models as `harness:model` keys. `permissionMode`: what the chat runs with, the project's default, else the latest chat's. The phone shows it and can't change it.
- `models`: the selected agent's models again, for phones from before agents.

`new_chat` names the agent (`harness`, and `accountId` for Phaseo) with one of its `model` ids and one of that model's effort ids as `reasoningEffort`; the computer refuses anything it didn't list. Without `harness` the model must be the default agent's, and leaving out the model too keeps the computer's choice (refused only when nothing above applies). A computer from before `list_models` answers it with `invalid_frame`, and one from before agents ignores `mode` and sends only `models` and `selected`.

List rows carry `model`, `branch` (the worktree's) and `settled`; `read_chat`'s chat adds `reasoningEffort` when the chat set one. `effortLabel(id)` gives the word both apps show for an effort.

## Organising and changing threads

From version 3 a phone organises threads, changes their settings and edits their queue, through the window's own commands and refusals:

- `update_chat` with an `action`: `settle`, `unsettle`, `wake`, `mark-unread`, `archive`, `unarchive`, `pin`, `unpin`, `rename` (with `title`) or `snooze` (with `until`, an ISO time). It answers with the row as it is now, so the phone can show it and offer the reverse as Undo. Agents' and side chats go with their parent and are refused as `not_found`. The relay holds it for an offline computer, as it holds `send`.
- `list_chats` with `archived: true` lists the archived threads instead; a phone that had a thread hears `chat_updated` with `archived: true` when it leaves the list. Rows add `pinned` and `snoozedUntil` (only while snoozed).
- `set_chat` changes a stopped thread's `mode` (Code ⇄ Plan only; a Chat stays one), `model` (one its own agent lists; another agent would be a new thread) or `reasoningEffort` (kept where that agent keeps it: on the chat for Codex and Grok, as a model option for the rest); `defaultEffort: true` clears the effort so the model runs at its own default. Permissions stay the computer's.
- `read_chat`'s chat adds `queue`, `harness`, `accountId`, `permissionMode` and linked `pullRequests`. `queue` removes, edits (`text`), moves (`up`, `down`) or sends now (`steer`) a queued message.
- A person's message that started a turn with saved snapshots gets `changes` (files, lines added and removed) once the computer has read them; the message is sent again with it.

## Versions and projects

`hello` carries the phone's `phoneProtocolVersion` as `protocol`, and the computer answers with the lower of the two, so a phone from before version 2 (which sends none and refuses a higher answer) is told 1 and keeps working. A phone shows a newer feature only when the answer is high enough; an older computer answers an unknown request with `invalid_frame`. From 2, `hello` also lists `capabilities`, the powers this phone has beyond threads (see Capabilities and review).

`list_projects` (version 2) returns every project, pinned first in the window's order: `repository` says whether it is a git checkout, archived projects are marked `archived`, and a worktree names its source as `worktreeOf` (its chats list under the source, as rows already say). Removed worktrees and Factory's per-item worktrees are left out. Once a phone has read the list, the computer sends `projects_changed` with the whole list whenever it changes; phones that never asked never get it.

## Capabilities and review

From version 4 each paired phone has three switches on the computer, in Settings → Phone: `code` (on unless turned off, also for phones paired earlier), `changes` and `terminal` (off until turned on). `hello` lists the ones that are on; a phone below 4 is told none, since none of its frames needs one. When the person flips a switch, the computer sends `{ type: "access", capabilities }` to that phone's connections at once, and it checks every request against the switches as they are then. A request without its capability is refused with `forbidden` ("Allow this on the computer: Settings → Phone").

With `code`:

- `git_status { projectId }`: the project folder's branch, upstream (ahead and behind), whether it has a remote, and each changed file's `status` (added, modified, deleted, renamed, untracked, conflicted) and whether some of it is `staged`. No diff text. `repository: false` for a folder that isn't a checkout. The phone asks when its list shows and when a thread in that project ends a turn; nothing polls.
- `read_diff { scope, chatId | projectId, messageId?, baseRef? }`: `scope` is `uncommitted`, `branch` (against `baseRef`, else the computer's guess of the base) or `turn`. A chat's diff is in the chat's own folder, its worktree's when it has one. A turn needs `chatId`; `messageId` names the person's message that started it (else the latest with snapshots), and the computer reads the snapshots from that message, so a phone never sends tree ids. The answer lists every file with its lines added and removed (-1 for binary) and, while the frame has room, its `patch` (from `diff --git` on). A file past the room, or over `phoneLimits.diffFileBytes` (512 KB) on its own, comes without one; `truncated` says the computer stopped reading a very large diff.
- `read_diff_file { …same target, path, hash }`: one file of the diff `read_diff` answered with `hash`, its patch cut at the last whole line under 512 KB (`truncated`). Refused as `rejected` once the diff has changed, so two versions are never mixed.

None of these is held by Phaseo Connect for an offline computer. A review comment never reaches the computer as a frame: the phone puts it into the thread's message, which the person sends.

## Files

From version 5, also with `code`, and read-only. Both name a `chatId` (the thread's folder, its worktree's when it has one) or a `projectId`, not both.

- `list_files { directory }` lists one folder (`""` for the top), folders first; `list_files { query }` searches names across the project. Both come from the window's file tree, so git-ignored files are left out, and `truncated` says more matched or the folder holds more than one frame carries.
- `read_file { path }` previews one file through the window's preview: `text` (cut at the last whole line under `phoneLimits.fileBytes`, 512 KB, and further if its escaped JSON wouldn't fit a frame; `truncated` says so), `image` as a data URL up to 512 KB, `too-large` for a larger image, or `unsupported` for binary files and PDFs, each with the file's `size`.

A path is relative to the project with forward slashes. The phone's frame refuses `.`/`..` segments, absolute paths and backslashes, and the computer resolves the real path and refuses anything outside the project, including through a link. Nothing here writes a file. "Add to message" on the phone puts `@path` into the thread's message, which the person sends.

## Git and pull requests

From version 6. Reads need `code`; anything that changes the repository or GitHub needs `changes` as well as `code`, since each answers with what the code looks like after. Each runs the computer window's own command (its Git menu, New worktree and pull request pane), so it is checked the same way, and the window says what the phone did ("Pushed from Daniel's Pixel"). GitHub work uses the computer's own GitHub CLI sign-in; the phone never sees a token. The computer checks the capability again when the work finishes, so nothing read after a switch is turned off goes out.

With `code`:

- `git_status { projectId, pullRequest: true }` adds the branch's pull request (`null` for none, or no GitHub remote). It asks GitHub (cached for 30 s), so folder headings leave it out.
- `list_branches { projectId }`: `current`, `local` and `remote` branches, newest first.
- `list_pull_requests { projectId, cursor? }`, `read_pull_request { projectId, number }` and `pull_request_files { projectId, number, headOid, baseOid, page? }`. A pull request's description and each comment are cut at `phoneLimits.pullRequestTextChars` (20,000 characters; `truncated`), its activity is the latest 100 comments, reviews and commits, and `mergeMethod` is the computer's setting (the project's, else the app's) when the repository allows it. Files come as `read_diff` has them; a patch GitHub left out, or that didn't fit the frame, is `truncated` without one.

With `changes` too:

- `git_action { projectId, action }`: `stage` and `unstage` (with `filename`), `commit` (with `message`, `all` to commit everything when nothing is staged, and `push`), `push`, `pull`, `create-branch` and `switch-branch` (with `name`). It answers with the status after. A failure is `rejected` with git's own words, such as "Add a remote before pushing.".
- `commit_message { projectId }` writes a message from the changes with the computer's title model, on the computer's Phaseo account, as the window's Write message does.
- `create_pull_request { projectId, chatId? }` creates the branch's pull request (the title model writes it when there is one, else the commits do) and links it to the thread; `opened_existing` says the branch already had one.
- `pr_action { projectId, number, headOid, action }`: `merge` (with `method`), `close`, `reopen`, `comment` (with `body`) or `review` (`approve`, `request-changes` or `comment`, with `body`; line comments stay on the computer). It is refused once the pull request's head is no longer `headOid`, and answers with the pull request after.
- `new_chat { …, workspace: { kind: "worktree", base } }` starts the thread in a new worktree from `base`, as the window's New worktree does.

None of these is held by Phaseo Connect for an offline computer: a commit or merge that ran hours later, after the phone gave up waiting, would surprise the person.

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
