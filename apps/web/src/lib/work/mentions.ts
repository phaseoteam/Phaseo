import type { WorkMember } from "./types";

/** The @mention being typed just before the caret, if any: "@ali|" gives { query: "ali", start }. */
export function activeMention(text: string, caret: number): { query: string; start: number } | null {
	const before = text.slice(0, Math.max(0, caret));
	const match = before.match(/(^|[\s(])@([\p{L}\p{N}._-]{0,40})$/u);
	if (!match) return null;
	return { query: match[2] ?? "", start: before.length - (match[2]?.length ?? 0) - 1 };
}

/** The handle a member is mentioned by: their display name without spaces, or their email local part. */
export function mentionHandle(member: WorkMember): string {
	const name = member.name?.trim();
	if (name) return name.replace(/\s+/g, "");
	const local = member.email?.split("@")[0]?.trim();
	return local || member.userId.slice(0, 8);
}

/** Members whose name, handle or email starts with the query, best first, up to limit. */
export function mentionSuggestions(members: WorkMember[], query: string, limit = 6): WorkMember[] {
	const q = query.toLowerCase();
	const scored = members
		.map((member) => {
			const fields = [member.name ?? "", mentionHandle(member), member.email ?? ""].map((field) => field.toLowerCase());
			const words = (member.name ?? "").toLowerCase().split(/\s+/);
			const score = !q ? 1 : fields.some((field) => field.startsWith(q)) ? 3 : words.some((word) => word.startsWith(q)) ? 2 : fields.some((field) => field.includes(q)) ? 1 : 0;
			return { member, score };
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score || mentionHandle(a.member).localeCompare(mentionHandle(b.member)));
	return scored.slice(0, limit).map(({ member }) => member);
}

/** Replaces the mention being typed with "@handle " and returns the new text and caret. */
export function insertMention(text: string, mention: { start: number; query: string }, member: WorkMember): { text: string; caret: number } {
	const handle = `@${mentionHandle(member)} `;
	const end = mention.start + 1 + mention.query.length;
	const rest = text.slice(end).replace(/^ /, "");
	return { text: text.slice(0, mention.start) + handle + rest, caret: mention.start + handle.length };
}
