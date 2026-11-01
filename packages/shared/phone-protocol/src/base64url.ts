// Plain base64url, so the same bytes encode identically in Electron, Node and React Native (no Buffer, no atob).
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const lookup = new Map([...alphabet].map((character, index) => [character, index]));

export function toBase64url(bytes: Uint8Array): string {
	let text = "";
	for (let index = 0; index < bytes.length; index += 3) {
		const a = bytes[index]!, b = bytes[index + 1], c = bytes[index + 2];
		text += alphabet[a >> 2]! + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
		if (b !== undefined) text += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
		if (c !== undefined) text += alphabet[c & 63]!;
	}
	return text;
}

export function fromBase64url(text: string): Uint8Array {
	if (text.length % 4 === 1) throw new Error("Invalid base64url text.");
	const bytes = new Uint8Array(Math.floor(text.length * 3 / 4));
	let bits = 0, buffer = 0, at = 0;
	for (const character of text) {
		const value = lookup.get(character);
		if (value === undefined) throw new Error("Invalid base64url text.");
		buffer = (buffer << 6) | value; bits += 6;
		if (bits >= 8) { bits -= 8; bytes[at++] = (buffer >> bits) & 255; }
	}
	return bytes;
}

const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: true });
export const utf8 = (text: string) => encoder.encode(text);
export const fromUtf8 = (bytes: Uint8Array) => decoder.decode(bytes);
export const utf8Length = (text: string) => encoder.encode(text).byteLength;
