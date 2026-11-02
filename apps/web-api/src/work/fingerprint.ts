// Error grouping. Two events share a group when they have the same exception type and the same
// top in-app frames (function and file, never line or column, so an edit elsewhere in the file
// doesn't split the group). Without in-app frames, the type and the message with its variable
// parts (numbers, hex, ids) replaced stand in.

import type { StackFrame } from "./stack";

export const FINGERPRINT_FRAME_COUNT = 5;
const MAX_MESSAGE_LENGTH = 500;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HEX_LITERAL = /\b0x[0-9a-f]+\b/gi;
// Bare hex runs at least 8 long with a digit in them (hashes, ids, addresses), not plain words.
const HEX_RUN = /\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi;
const NUMBER = /\d+(?:\.\d+)?/g;

/** The message with uuids, hex and numbers replaced, whitespace collapsed and length capped. */
export function normaliseMessage(message: string): string {
	return message
		.replace(UUID, "<uuid>")
		.replace(HEX_LITERAL, "<hex>")
		.replace(HEX_RUN, "<hex>")
		.replace(NUMBER, "<n>")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * The file as it goes into the fingerprint: no query or hash, no origin (the same bundle served
 * from two hosts is the same code), and content hashes in bundle names ("app.3f9a1c2b.js") taken
 * out so a redeploy doesn't start new groups.
 */
export function fingerprintFile(file: string | undefined): string {
	if (!file) return "";
	return file
		.replace(/[?#].*$/, "")
		.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "")
		.replace(/([.-])(?=[0-9a-z]*\d)[0-9a-z]{8,}(?=\.(?:m?js|cjs|jsx|tsx?)$)/gi, "$1<hash>")
		.toLowerCase();
}

function inAppFrames(frames: readonly StackFrame[]): StackFrame[] {
	return frames.filter((frame) => frame.inApp !== false && (frame.function || frame.file)).slice(0, FINGERPRINT_FRAME_COUNT);
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The fingerprint input, exposed for tests and debugging. */
export function fingerprintInput(args: { type: string; message: string; frames: readonly StackFrame[] }): string {
	const type = args.type.trim() || "Error";
	const frames = inAppFrames(args.frames);
	if (frames.length > 0) {
		return ["frames", type, ...frames.map((frame) => `${frame.function ?? "?"}|${fingerprintFile(frame.file)}`)].join("\n");
	}
	return ["message", type, normaliseMessage(args.message)].join("\n");
}

/** The group fingerprint: sha256 hex of the type plus top in-app frames, or of type plus message. */
export async function fingerprintError(args: { type: string; message: string; frames: readonly StackFrame[] }): Promise<string> {
	return sha256Hex(fingerprintInput(args));
}

/** Where the error happened, for the group list: the top in-app frame ("fn (file:line)"). */
export function culpritFor(frames: readonly StackFrame[]): string | null {
	const frame = inAppFrames(frames)[0];
	if (!frame) return null;
	const file = frame.file ? frame.file.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "") : "";
	const location = file ? `${file}${frame.line !== undefined ? `:${frame.line}` : ""}` : "";
	if (frame.function && location) return `${frame.function} (${location})`.slice(0, 500);
	return (frame.function || location).slice(0, 500) || null;
}
