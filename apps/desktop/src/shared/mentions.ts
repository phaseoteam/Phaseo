/**
 * Chips in the composer are stored in draft text as tokens, so drafts stay plain strings:
 * `@[label](kind:ref)`, with the ref URI-encoded. Files and chats keep a token in the sent message
 * so the message can show them as chips; attachments travel as attachment ids instead.
 */
import { mentionToken, parseMentions } from "@phaseo/app-kit/mentions";
import { maximumGithubReferences, parseGithubReferenceUrl } from "./issueView";

// The token format and parser are shared so the website and the mobile app can draw these chips too.
export { MENTION_KINDS, mentionPlainText, mentionToken, parseMentions, type Mention, type MentionKind, type Segment } from "@phaseo/app-kit/mentions";

/** Drag data for a chat dragged from the sidebar: `{ id, title }` as JSON. */
export const chatDragType = "application/x-phaseo-chat";

/**
 * What a draft sends: files become `@path` for the agent to open, chats keep their token (the agent
 * gets the id; the message shows a chip) and are listed as references, attachments become ids. A pull request or issue becomes a
 * Markdown link to it by number, which the message shows as a link, and is listed in `githubReferences` so the agent gets its context.
 */
export function composeMessage(draft: string) {
	const threadReferences: string[] = [], githubReferences: string[] = [], attachments: string[] = [], images: string[] = [];
	const text = parseMentions(draft).map(segment => {
		if (typeof segment === "string") return segment;
		if (segment.kind === "file") return `@${segment.ref}`;
		if (segment.kind === "folder") return `@${segment.ref}/`;
		if (segment.kind === "chat") { if (!threadReferences.includes(segment.ref)) threadReferences.push(segment.ref); return mentionToken(segment); }
		if (segment.kind === "pull-request" || segment.kind === "issue") {
			if (!/^https:\/\/github\.com\//.test(segment.ref)) return segment.label;
			if (!githubReferences.includes(segment.ref)) githubReferences.push(segment.ref);
			// Only the number goes in the text: the title is GitHub's, third-party text, and reaches the agent fenced with its context.
			return `[${segment.label.match(/^#\d+/)?.[0] ?? `#${segment.ref.split("/").at(-1)}`}](${segment.ref})`;
		}
		(segment.kind === "attachment" ? attachments : images).push(segment.ref);
		return "";
	}).join("").replace(/[ \t]+\n/g, "\n").trim();
	return { text, threadReferences: threadReferences.slice(0, 10), githubReferences: githubReferences.filter(url => parseGithubReferenceUrl(url)).slice(0, maximumGithubReferences), attachments, images };
}
