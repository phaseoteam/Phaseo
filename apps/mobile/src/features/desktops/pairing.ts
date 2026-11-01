import { decodePairingLink, EnvelopeChannel, generateKeyPair, parseRelayFrame, relayPairing, relayPhoneUrl, sharedKey, validatePairResult, type KeyPair, type PairingPayload, type PairResult } from "./protocol";
import { firstReachable, type FetchLike, type SavedDesktop } from "./reach";
import type { OpenSocket } from "./transport";

export type PairDeps = { fetch: FetchLike; openSocket: OpenSocket; deviceName: string; keyPair?: KeyPair; now?: () => Date; probeMs?: number; relayTimeoutMs?: number };

/** The payload in a scanned code or pasted link (copied text often carries spaces or line breaks). */
export const readPairingLink = (text: string): PairingPayload => decodePairingLink(text.replace(/\s+/g, ""));

async function pairDirect(url: string, request: { pairingCode: string; deviceName: string; devicePublicKey: string }, fetcher: FetchLike): Promise<PairResult> {
  const response = await fetcher(`${url.replace(/\/+$/, "")}/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The computer refused the pairing. Show a new code and scan it again.");
  return validatePairResult(body);
}

/**
 * Pairing over Phaseo Connect: sign in with the relay token derived from the pairing code, send one sealed pair frame
 * from the pseudo device id with this phone's public key beside it, and wait for the desktop's answer.
 */
function pairOverRelay(payload: PairingPayload & { connect: NonNullable<PairingPayload["connect"]> }, keys: KeyPair, deviceName: string, openSocket: OpenSocket, timeoutMs: number) {
  const { relayToken, deviceId } = relayPairing(payload.pairingCode);
  const channel = new EnvelopeChannel(sharedKey(keys.privateKey, payload.desktopPublicKey), deviceId, payload.desktopId);
  const socket = openSocket(relayPhoneUrl(payload.connect.relayUrl, payload.desktopId), relayToken);
  return new Promise<PairResult>((resolve, reject) => {
    let done = false;
    const finish = (error: Error | null, result?: PairResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close(1000, "Paired");
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error("The computer didn't answer through Phaseo Connect. Check it's online and show a new code.")), timeoutMs);
    socket.onopen = () => {
      const envelope = channel.seal({ id: "pair", type: "pair", pairingCode: payload.pairingCode, deviceName, devicePublicKey: keys.publicKey });
      socket.send(JSON.stringify({ ...envelope, senderPublicKey: keys.publicKey }));
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const frame = parseRelayFrame(event.data);
      if (!frame) return;
      if (!("ciphertext" in frame)) {
        if (frame.type === "error") finish(new Error("Phaseo Connect refused the pairing. Show a new code on the computer and scan it again."));
        return;
      }
      let answer: { ok?: unknown; result?: unknown; error?: { message?: unknown } };
      try { answer = JSON.parse(channel.open(frame)); } catch { return; }
      if (answer.ok === true) {
        try { finish(null, validatePairResult(answer.result)); } catch (error) { finish(error as Error); }
      } else finish(new Error(typeof answer.error?.message === "string" ? answer.error.message : "The computer refused the pairing."));
    };
    socket.onerror = () => { /* onclose follows */ };
    socket.onclose = () => finish(new Error("Couldn't reach Phaseo Connect. Check your connection and try again."));
  });
}

/** Pairs with the desktop in a scanned code: directly when one of its addresses answers, else through Phaseo Connect. */
export async function pairDesktop(link: string, deps: PairDeps): Promise<SavedDesktop> {
  const payload = readPairingLink(link);
  const keys = deps.keyPair ?? generateKeyPair();
  const request = { pairingCode: payload.pairingCode, deviceName: deps.deviceName.slice(0, 80), devicePublicKey: keys.publicKey };
  // The code works once, so only the first address that answers is asked to pair.
  const url = await firstReachable(payload.direct, payload.desktopId, deps.fetch, deps.probeMs);
  let result: PairResult;
  if (url) result = await pairDirect(url, request, deps.fetch);
  else if (payload.connect) result = await pairOverRelay({ ...payload, connect: payload.connect }, keys, request.deviceName, deps.openSocket, deps.relayTimeoutMs ?? 20_000);
  else throw new Error(`Couldn't reach ${payload.desktopName}. Put this phone on the same Wi-Fi or tailnet, or turn on Phaseo Connect on the computer.`);
  if (result.desktopId !== payload.desktopId) throw new Error("A different computer answered. Scan the code again.");
  return {
    desktopId: payload.desktopId,
    desktopName: result.desktopName,
    deviceId: result.deviceId,
    deviceName: request.deviceName,
    deviceToken: result.deviceToken,
    relayToken: result.relayToken,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    desktopPublicKey: payload.desktopPublicKey,
    direct: payload.direct,
    ...(payload.connect ? { connect: payload.connect } : {}),
    pairedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}
