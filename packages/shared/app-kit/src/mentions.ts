/**
 * Chips in text are stored as tokens, so drafts and messages stay plain strings:
 * `@[label](kind:ref)`, with the ref URI-encoded. The desktop composer writes them; every app that
 * shows those messages reads them back with `parseMentions` and draws each one as an inline chip
 * (the `inline-chip` recipe in `ui-recipes`).
 */

/** A pull request or issue chip's ref is its GitHub URL and its label "#N title" (the composer's `#` menu). */
export type MentionKind = "file" | "folder" | "chat" | "attachment" | "image" | "pull-request" | "issue";
export type Mention = { kind: MentionKind; ref: string; label: string };
export type Segment = string | Mention;

export const MENTION_KINDS: readonly MentionKind[] = ["file", "folder", "chat", "attachment", "image", "pull-request", "issue"];

const tokenPattern = () => new RegExp(`@\\[([^\\]\\n]*)\\]\\((${MENTION_KINDS.join("|")}):([^)\\s]+)\\)`, "g");

export function mentionToken(mention: Mention) {
	return `@[${mention.label.replace(/[[\]\n]/g, " ")}](${mention.kind}:${encodeURIComponent(mention.ref).replace(/[()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)})`;
}

/** Splits text into plain runs and chips. Malformed tokens stay as text. */
export function parseMentions(text: string): Segment[] {
	const segments: Segment[] = [];
	let last = 0;
	for (const match of text.matchAll(tokenPattern())) {
		let ref: string;
		// The pattern always captures all three groups.
		const [token, label = "", kind, encoded = ""] = match;
		try { ref = decodeURIComponent(encoded); } catch { continue; }
		if (match.index > last) segments.push(text.slice(last, match.index));
		segments.push({ kind: kind as MentionKind, ref, label });
		last = match.index + token.length;
	}
	if (last < text.length) segments.push(text.slice(last));
	return segments;
}

/** Plain text for previews and titles: chips read as their label. */
export function mentionPlainText(text: string) {
	return parseMentions(text).map(segment => typeof segment === "string" ? segment : segment.kind === "chat" ? `@${segment.label}` : segment.label).join("");
}
