// Slack request signing (v0): HMAC-SHA256 with the app's signing secret over
// "v0:<X-Slack-Request-Timestamp>:<raw body>", sent hex encoded as
// X-Slack-Signature "v0=<hex>". Requests more than five minutes from now are
// refused as possible replays. A replay inside the window still carries a known
// event_id, which the thread coordinator dedupes.

const encoder = new TextEncoder();
const SIGNATURE_PATTERN = /^v0=[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN = /^[0-9]{1,12}$/;
export const SIGNATURE_WINDOW_SECONDS = 5 * 60;

export type SignatureCheck = "ok" | "missing" | "stale" | "bad_signature";

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
	for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	return bytes;
}

export async function verifySlackSignature(args: {
	signingSecret: string;
	timestamp: string | null | undefined;
	signature: string | null | undefined;
	body: string;
	now?: number;
}): Promise<SignatureCheck> {
	const timestamp = args.timestamp?.trim() ?? "";
	const signature = args.signature?.trim().toLowerCase() ?? "";
	if (!args.signingSecret || !TIMESTAMP_PATTERN.test(timestamp) || !SIGNATURE_PATTERN.test(signature)) return "missing";
	const nowSeconds = Math.floor((args.now ?? Date.now()) / 1000);
	if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_WINDOW_SECONDS) return "stale";
	const key = await crypto.subtle.importKey("raw", encoder.encode(args.signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
	// crypto.subtle.verify compares in constant time.
	const valid = await crypto.subtle.verify("HMAC", key, hexBytes(signature.slice(3)), encoder.encode(`v0:${timestamp}:${args.body}`));
	return valid ? "ok" : "bad_signature";
}

/** Signs a body the way Slack does. Used by tests and local tools only. */
export async function signSlackRequest(signingSecret: string, timestamp: number, body: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`v0:${timestamp}:${body}`)));
	return `v0=${[...mac].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
