import type { DatabaseSync, StatementSync } from "node:sqlite";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { activitiesForWindow, conversationPageBytes, type ConversationPage, type ConversationPageQuery } from "../shared/conversationPage";
import { isPhaseoUsageId } from "../shared/usageAmounts";
import type { AgentActivity, Message, Task } from "../shared/workspace";

type Kind = 0 | 1;
type Entry = Message | AgentActivity;
type Row = { rowid: number; id: string; role: string | null; timeline_order: number | null; data: string | Uint8Array };
/** Where a partial chat's entries start: messages from its turn, activities from that turn's first. */
export type EntryOffsets = { messages: number; activities: number };
type Stored = { ids: string[]; data: string[] };
const kinds = [["messages", 0], ["activities", 1]] as const;
const encoder = new TextEncoder();
/** Tool output is large and never searched, so activities over this many bytes are stored compressed. */
const compressFrom = 1024;
/** What a row stores for `data`: deflated above `compressFrom` bytes when `compress` allows. */
export function packText(data: string, compress = true) { const bytes = encoder.encode(data).byteLength; return { bytes, stored: compress && bytes > compressFrom ? deflateRawSync(data) as Uint8Array : data }; }
export const unpackText = (data: string | Uint8Array) => typeof data === "string" ? data : inflateRawSync(data).toString("utf8");

/**
 * An entry's rowid is its place: chat key × 2^25 + kind × 2^24 + position. A chat's messages or activities are one
 * rowid range, so reading from a position is a range scan of the table itself and no separate key index is kept.
 * That allows 2^24 entries of each kind per chat and 2^28 chats within JavaScript's exact integers.
 */
const kindSpan = 2 ** 24, chatSpan = 2 ** 25;
const base = (key: number, kind: Kind) => key * chatSpan + kind * kindSpan;

/**
 * The tables behind TaskEntries. `id`, `role` and `timeline_order` are columns and are not repeated in `data`; the
 * indexes are partial, so neither kind carries the other's.
 */
export const taskEntriesSchema = `CREATE TABLE IF NOT EXISTS task_entries (task_key INTEGER NOT NULL, kind INTEGER NOT NULL, id TEXT NOT NULL, owner TEXT, timeline_order REAL, role TEXT, bytes INTEGER NOT NULL, data NOT NULL);
	CREATE INDEX IF NOT EXISTS task_messages_by_id ON task_entries (task_key, id) WHERE kind = 0;
	CREATE INDEX IF NOT EXISTS task_activities_by_owner ON task_entries (task_key, owner) WHERE kind = 1;
	CREATE TRIGGER IF NOT EXISTS task_entries_removed AFTER DELETE ON tasks BEGIN DELETE FROM task_entries WHERE rowid >= old.key * ${chatSpan} AND rowid < (old.key + 1) * ${chatSpan}; END;`;
/** A chat's messages as a rowid range, for SQL elsewhere (search, the delegation trigger). */
export const messageRange = (key: string) => `rowid >= ${key} * ${chatSpan} AND rowid < ${key} * ${chatSpan} + ${kindSpan}`;
const entryColumns = "rowid, id, role, timeline_order, data";

/** What a row keeps in `data`: the entry without the fields stored as columns. */
function encode(entry: Entry) {
	const rest: Record<string, unknown> = {};
	for (const name in entry) if (name !== "id" && name !== "timelineOrder" && name !== "role") rest[name] = (entry as Record<string, unknown>)[name];
	return JSON.stringify(rest);
}
const text = (row: Row) => unpackText(row.data);
function decode(row: Row, data = text(row)): Entry {
	const entry = JSON.parse(data) as Entry & { role?: string };
	entry.id = row.id;
	if (row.role !== null) entry.role = row.role;
	if (row.timeline_order !== null) entry.timelineOrder = row.timeline_order;
	return entry;
}

/**
 * A chat's messages and activities, one row each, beside its header in `tasks`. Saves write only the entries that
 * changed, and an entry that keeps its place rewrites only its data, so streaming into a long chat touches one row.
 * Pages are rowid range reads whose cost does not grow with the chat.
 */
export class TaskEntries {
	private readonly statements = new Map<string, StatementSync>();
	/** Each chat's stored entries (ids and encoded data) at a revision, so a save compares strings instead of reading rows. */
	private readonly saved = new Map<number, { revision: number; messages: Stored; activities: Stored }>();
	constructor(private readonly db: DatabaseSync) {}
	private statement(sql: string) { let statement = this.statements.get(sql); if (!statement) this.statements.set(sql, statement = this.db.prepare(sql)); return statement; }
	private remember(key: number, value: { revision: number; messages: Stored; activities: Stored }) { this.saved.delete(key); this.saved.set(key, value); if (this.saved.size > 32) this.saved.delete(this.saved.keys().next().value!); }
	/** Drops what is cached for a chat; a reused key must not inherit it. */
	forget(key: number) { this.saved.delete(key); }
	/** The revision the cache now matches, once the header's write has numbered it. */
	markRevision(key: number, revision: number) { const value = this.saved.get(key); if (value) value.revision = revision; }

	private rows(key: number, kind: Kind, from = 0) {
		return this.statement(`SELECT ${entryColumns} FROM task_entries WHERE rowid >= ? AND rowid < ? ORDER BY rowid`).all(base(key, kind) + from, base(key, kind) + kindSpan) as Row[];
	}
	/** Reads entries from a position on, with what is stored for each. */
	private read(key: number, kind: Kind, from = 0) {
		const rows = this.rows(key, kind, from), data = rows.map(text);
		return { entries: rows.map((row, index) => decode(row, data[index])), stored: { ids: rows.map(row => row.id), data } };
	}

	/** Every entry of a chat, in order. */
	load(key: number, revision: number): { messages: Message[]; activities: AgentActivity[] } {
		const messages = this.read(key, 0), activities = this.read(key, 1);
		this.remember(key, { revision, messages: messages.stored, activities: activities.stored });
		return { messages: messages.entries as Message[], activities: activities.entries as AgentActivity[] };
	}

	/**
	 * The latest turn of a chat: messages from `fromMessageId` on and activities from that turn's first on, with where
	 * they start. Streaming rewrites only these, so a flush costs the same in a long chat as in a new one.
	 */
	tail(key: number, fromMessageId: string): { messages: Message[]; activities: AgentActivity[]; offsets: EntryOffsets } | undefined {
		const start = (this.statement("SELECT min(rowid) AS rowid FROM task_entries WHERE task_key = ? AND kind = 0 AND id = ?").get(key, fromMessageId) as { rowid: number | null }).rowid;
		if (start === null) return undefined;
		const owned = (this.statement("SELECT min(rowid) AS rowid FROM task_entries WHERE task_key = ? AND kind = 1 AND owner = ?").get(key, fromMessageId) as { rowid: number | null }).rowid;
		const offsets = { messages: start - base(key, 0), activities: owned === null ? this.count(key, 1) : owned - base(key, 1) };
		return { messages: this.read(key, 0, offsets.messages).entries as Message[], activities: this.read(key, 1, offsets.activities).entries as AgentActivity[], offsets };
	}

	/** Writes what changed (from `offsets` on when the chat is a tail), given the revision now stored. Run inside the save's transaction. */
	save(key: number, task: Task, revision: number | undefined, offsets?: EntryOffsets) {
		// A cache from another revision (another connection saved since) is not trusted.
		let previous = this.saved.get(key);
		if (previous && previous.revision !== revision) { this.saved.delete(key); previous = undefined; }
		if (offsets) {
			const slice = (stored: Stored, from: number): Stored => ({ ids: stored.ids.slice(from), data: stored.data.slice(from) });
			const before = previous ? { messages: slice(previous.messages, offsets.messages), activities: slice(previous.activities, offsets.activities) } : { messages: this.read(key, 0, offsets.messages).stored, activities: this.read(key, 1, offsets.activities).stored };
			const after = this.write(key, task, before, offsets);
			const join = (head: Stored, from: number, tail: Stored): Stored => ({ ids: [...head.ids.slice(0, from), ...tail.ids], data: [...head.data.slice(0, from), ...tail.data] });
			if (previous) this.remember(key, { revision: previous.revision, messages: join(previous.messages, offsets.messages, after.messages), activities: join(previous.activities, offsets.activities, after.activities) });
			return;
		}
		const after = this.write(key, task, previous ?? { messages: this.read(key, 0).stored, activities: this.read(key, 1).stored });
		this.remember(key, { revision: revision ?? 0, ...after });
	}

	private write(key: number, task: Task, previous: { messages: Stored; activities: Stored }, offsets: EntryOffsets = { messages: 0, activities: 0 }) {
		// An activity belongs to a turn when its id is `<user message id>:<step>`; a tail finds earlier turns among the stored messages.
		const users = new Set((task.messages ?? []).filter(message => message.role === "user").map(message => message.id));
		const isUser = (id: string) => users.has(id) || (offsets.messages > 0 && Boolean(this.statement("SELECT 1 FROM task_entries WHERE task_key = ? AND kind = 0 AND id = ? AND role = 'user'").get(key, id)));
		const owner = (id: string) => { const prefix = id.slice(0, Math.max(0, id.indexOf(":"))); return prefix && isUser(prefix) ? prefix : null; };
		// The same entry in the same place rewrites only its data, so no index changes.
		const update = this.statement("UPDATE task_entries SET timeline_order = ?, bytes = ?, data = ? WHERE rowid = ?");
		const replace = this.statement("INSERT OR REPLACE INTO task_entries (rowid, task_key, kind, id, owner, timeline_order, role, bytes, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
		const next = { messages: { ids: [] as string[], data: [] as string[] }, activities: { ids: [] as string[], data: [] as string[] } };
		for (const [name, kind] of kinds) {
			const entries = (task[name] ?? []) as Entry[], before = previous[name], after = next[name], start = base(key, kind) + offsets[name];
			for (let index = 0; index < entries.length; index++) {
				const entry = entries[index], data = encode(entry);
				after.ids.push(entry.id); after.data.push(data);
				const same = index < before.ids.length && before.ids[index] === entry.id;
				if (same && before.data[index] === data) continue;
				const { bytes, stored } = packText(data, kind === 1);
				if (same) update.run(entry.timelineOrder ?? null, bytes, stored, start + index);
				else replace.run(start + index, key, kind, entry.id, kind === 1 ? owner(entry.id) : null, entry.timelineOrder ?? null, kind === 0 ? (entry as Message).role : null, bytes, stored);
			}
			if (before.ids.length > entries.length) this.statement("DELETE FROM task_entries WHERE rowid >= ? AND rowid < ?").run(start + entries.length, base(key, kind) + kindSpan);
		}
		return next;
	}

	/** Positions run from 0 without gaps, so the count is the last rowid's place plus one. */
	count(key: number, kind: Kind) {
		const last = (this.statement("SELECT max(rowid) AS rowid FROM task_entries WHERE rowid >= ? AND rowid < ?").get(base(key, kind), base(key, kind) + kindSpan) as { rowid: number | null }).rowid;
		return last === null ? 0 : last - base(key, kind) + 1;
	}

	/** One page, with the same window and byte rules as conversationPageOf, read from the rows it covers. */
	page(key: number, query: ConversationPageQuery, revision: number): ConversationPage {
		const kind: Kind = query.kind === "messages" ? 0 : 1, total = this.count(key, kind), cursor = query.beforeId ?? query.afterId ?? query.fromId, first = base(key, kind);
		// The literal kind lets message cursors use their partial index; activity cursors (rare) scan the chat's activities.
		const found = cursor === undefined ? null : (this.statement(kind === 0 ? "SELECT min(rowid) AS rowid FROM task_entries WHERE task_key = ? AND kind = 0 AND id = ?" : `SELECT min(rowid) AS rowid FROM task_entries WHERE rowid >= ? * ${chatSpan} + ${kindSpan} AND rowid < (? + 1) * ${chatSpan} AND id = ?`).get(...(kind === 0 ? [key, cursor] : [key, key, cursor])) as { rowid: number | null }).rowid;
		if (cursor !== undefined && found === null) throw new Error("Conversation position no longer exists. Reload the latest history.");
		const anchor = found === null ? -1 : found - first;
		const end = query.beforeId ? anchor : query.afterId ? Math.min(total, anchor + 1 + query.limit) : query.fromId ? Math.min(total, anchor + query.limit) : total;
		const start = query.afterId ? anchor + 1 : query.fromId ? anchor : Math.max(0, end - query.limit);
		const rows = this.statement(`SELECT bytes, ${entryColumns} FROM task_entries WHERE rowid >= ? AND rowid < ? ORDER BY rowid`).all(first + start, first + end) as (Row & { bytes: number })[];
		// Keep the cursor-adjacent contiguous window, including one oversized entry.
		const forward = Boolean(query.afterId || query.fromId), ordered = forward ? rows : [...rows].reverse(), kept: typeof rows = [];
		let bytes = 0;
		for (const row of ordered) { bytes += row.bytes + 1; if (kept.length && bytes > conversationPageBytes - 1) break; kept.push(row); }
		if (!forward) kept.reverse();
		const from = kept.length ? kept[0].rowid - first : start, to = kept.length ? kept.at(-1)!.rowid - first + 1 : end;
		return { kind: query.kind, entries: kept.map(row => decode(row)), earlier: from, later: total - to, revision };
	}

	/** The activities of a page of messages' turns: those owned by its user messages, plus unowned ones by position. */
	turnActivities(key: number, page: ConversationPage): AgentActivity[] {
		const window = page.entries as Message[], users = window.filter(message => message.role === "user").map(message => message.id);
		const next = (this.statement("SELECT timeline_order FROM task_entries WHERE rowid = ?").get(base(key, 0) + page.earlier + window.length) as { timeline_order: number | null } | undefined)?.timeline_order ?? undefined;
		// Two lookups on the owner index: the window's turns, and activities that belong to no turn.
		const owned = this.statement(`SELECT ${entryColumns} FROM task_entries WHERE task_key = ? AND kind = 1 AND owner IN (SELECT value FROM json_each(?))`).all(key, JSON.stringify(users)) as Row[];
		const unowned = this.statement(`SELECT ${entryColumns} FROM task_entries WHERE task_key = ? AND kind = 1 AND owner IS NULL`).all(key) as Row[];
		const rows = [...owned, ...unowned].sort((a, b) => a.rowid - b.rowid);
		return activitiesForWindow(window, rows.map(row => decode(row)) as AgentActivity[], new Set(users), { next, latest: page.later === 0 });
	}

	/** The texts of a chat's Phaseo usage reports (steps and compactions), read by id from its activities alone. */
	phaseoUsageReports(key: number): string[] { return this.phaseoUsageEntries(key).map(entry => entry.text); }
	/** The same reports with their ids, which say which turn each belongs to. */
	phaseoUsageEntries(key: number): { id: string; text: string }[] {
		const rows = this.statement(`SELECT ${entryColumns} FROM task_entries WHERE rowid >= ? AND rowid < ? AND (id GLOB '*usage:[0-9]*' OR id GLOB '*compaction:*:usage' OR id GLOB '*autopilot:*:usage')`).all(base(key, 1), base(key, 1) + kindSpan) as Row[];
		return rows.filter(row => isPhaseoUsageId(row.id)).map(row => ({ id: row.id, activity: decode(row) as AgentActivity })).filter(({ activity }) => activity.type === "usage").map(({ id, activity }) => ({ id, text: activity.text }));
	}
}
