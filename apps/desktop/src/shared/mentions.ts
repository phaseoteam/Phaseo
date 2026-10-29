/**
 * Chips in the composer are stored in draft text as tokens, so drafts stay plain strings:
 * `@[label](kind:ref)`, with the ref URI-encoded. Files and chats keep a token in the sent message
 * so the message can show them as chips; attachments travel as attachment ids instead.
 */
/** Drag data for a chat dragged from the sidebar: `{ id, title }` as JSON. */
export const chatDragType = "application/x-phaseo-chat";

/** A pull request chip's ref is its GitHub URL and its label "#N title" (T3's `#` composer context). */
export type MentionKind = "file" | "folder" | "chat" | "attachment" | "image" | "pull-request";
export type Mention = { kind: MentionKind; ref: string; label: string };
export type Segment = string | Mention;

const kinds = "file|folder|chat|attachment|image|pull-request";
const tokenPattern = () => new RegExp(`@\\[([^\\]\\n]*)\\]\\((${kinds}):([^)\\s]+)\\)`, "g");

export function mentionToken(mention: Mention) {
	return `@[${mention.label.replace(/[[\]\n]/g, " ")}](${mention.kind}:${encodeURIComponent(mention.ref).replace(/[()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)})`;
}

/** Splits text into plain runs and chips. Malformed tokens stay as text. */
export function parseMentions(text: string): Segment[] {
	const segments: Segment[] = [];
	let last = 0;
	for (const match of text.matchAll(tokenPattern())) {
		let ref: string;
		try { ref = decodeURIComponent(match[3]); } catch { continue; }
		if (match.index > last) segments.push(text.slice(last, match.index));
		segments.push({ kind: match[2] as MentionKind, ref, label: match[1] });
		last = match.index + match[0].length;
	}
	if (last < text.length) segments.push(text.slice(last));
	return segments;
}

/**
 * What a draft sends: files become `@path` for the agent to open, chats keep their token (the agent
 * gets the id; the message shows a chip) and are listed as references, attachments become ids. A pull request becomes a
 * Markdown link to it, which the agent can read and the message shows as a pull request chip.
 */
export function composeMessage(draft: string) {
	const threadReferences: string[] = [], attachments: string[] = [], images: string[] = [];
	const text = parseMentions(draft).map(segment => {
		if (typeof segment === "string") return segment;
		if (segment.kind === "file") return `@${segment.ref}`;
		if (segment.kind === "folder") return `@${segment.ref}/`;
		if (segment.kind === "chat") { if (!threadReferences.includes(segment.ref)) threadReferences.push(segment.ref); return mentionToken(segment); }
		if (segment.kind === "pull-request") return /^https:\/\/github\.com\//.test(segment.ref) ? `[${segment.label.replace(/[[\]]/g, "")}](${segment.ref})` : segment.label;
		(segment.kind === "attachment" ? attachments : images).push(segment.ref);
		return "";
	}).join("").replace(/[ \t]+\n/g, "\n").trim();
	return { text, threadReferences: threadReferences.slice(0, 10), attachments, images };
}

/** Plain text for previews and titles: chips read as their label. */
export function mentionPlainText(text: string) {
	return parseMentions(text).map(segment => typeof segment === "string" ? segment : segment.kind === "chat" ? `@${segment.label}` : segment.label).join("");
}
