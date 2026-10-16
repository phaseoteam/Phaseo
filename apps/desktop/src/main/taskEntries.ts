import type { DatabaseSync, StatementSync } from "node:sqlite";
import { activitiesForWindow, conversationPageBytes, type ConversationPage, type ConversationPageQuery } from "../shared/conversationPage";
import type { AgentActivity, Message, Task } from "../shared/workspace";

type Kind = 0 | 1;
/** Where a partial chat's entries start: messages from its turn, activities from that turn's first. */
export type EntryOffsets = { messages: number; activities: number };
const kinds = [["messages", 0], ["activities", 1]] as const;
const encoder = new TextEncoder();

/**
 * A chat's messages and activities, one row each, beside its header in `tasks`. Saves write only the entries that
 * changed, so streaming into a long chat writes a few kilobytes rather than the whole conversation, and pages are
 * indexed range reads whose cost does not grow with the chat.
 *
 * Rows written the old way (the whole conversation inside `tasks.data`, by an older build or a fixture) are queued by
 * a trigger and adopted before the next read.
 */
export class TaskEntries {
	private readonly statements = new Map<string, StatementSync>();
	/** The serialised entries last read or written per chat, so a save compares strings instead of re-reading rows. */
	private readonly saved = new Map<string, { messages: string[]; activities: string[] }>();
	constructor(private readonly db: DatabaseSync) {
		db.exec(`CREATE TABLE IF NOT EXISTS task_entries (task_id TEXT NOT NULL, kind INTEGER NOT NULL, position INTEGER NOT NULL, id TEXT NOT NULL, owner TEXT, timeline_order REAL, role TEXT, bytes INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (task_id, kind, position));
			-- Both carry the position, so finding where a message or a turn starts never walks the chat's rows.
			CREATE INDEX IF NOT EXISTS task_entries_by_id ON task_entries (task_id, kind, id, position);
			CREATE INDEX IF NOT EXISTS task_entries_by_owner ON task_entries (task_id, kind, owner, position);
			CREATE TABLE IF NOT EXISTS task_entries_pending (id TEXT PRIMARY KEY);
			CREATE TRIGGER IF NOT EXISTS task_entries_removed AFTER DELETE ON tasks BEGIN DELETE FROM task_entries WHERE task_id = old.id; DELETE FROM task_entries_pending WHERE id = old.id; END;
			CREATE TRIGGER IF NOT EXISTS task_entries_legacy_insert AFTER INSERT ON tasks WHEN json_type(new.data, '$.messages') IS NOT NULL OR json_type(new.data, '$.activities') IS NOT NULL
				BEGIN INSERT OR IGNORE INTO task_entries_pending (id) VALUES (new.id); END;
			CREATE TRIGGER IF NOT EXISTS task_entries_legacy_update AFTER UPDATE OF data ON tasks WHEN json_type(new.data, '$.messages') IS NOT NULL OR json_type(new.data, '$.activities') IS NOT NULL
				BEGIN INSERT OR IGNORE INTO task_entries_pending (id) VALUES (new.id); END;`);
		// The first open of a database from before this table queues every chat once.
		if (Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version) < 3) {
			db.exec("INSERT OR IGNORE INTO task_entries_pending (id) SELECT id FROM tasks WHERE json_type(data, '$.messages') IS NOT NULL OR json_type(data, '$.activities') IS NOT NULL; PRAGMA user_version=3;");
		}
	}
	private statement(sql: string) { let statement = this.statements.get(sql); if (!statement) this.statements.set(sql, statement = this.db.prepare(sql)); return statement; }
	private remember(id: string, value: { messages: string[]; activities: string[] }) { this.saved.delete(id); this.saved.set(id, value); if (this.saved.size > 32) this.saved.delete(this.saved.keys().next().value!); }
	forget(id: string) { this.saved.delete(id); }

	/** Moves conversations written inside `tasks.data` into rows. Cheap when there are none: one indexed lookup. */
	adopt() {
		const pending = this.statement("SELECT id FROM task_entries_pending LIMIT 200").all() as { id: string }[];
		if (!pending.length) return;
		const own = !this.db.isTransaction;
		if (own) this.db.exec("BEGIN IMMEDIATE");
		try {
			for (const { id } of pending) {
				const row = this.statement("SELECT data FROM tasks WHERE id = ?").get(id) as { data: string } | undefined;
				this.statement("DELETE FROM task_entries_pending WHERE id = ?").run(id);
				if (!row) continue;
				const task = JSON.parse(row.data) as Task;
				this.forget(id); this.statement("DELETE FROM task_entries WHERE task_id = ?").run(id);
				this.remember(id, this.write(task, { messages: [], activities: [] }));
				const head = { ...task, messages: undefined, activities: undefined };
				this.statement("UPDATE tasks SET data = ? WHERE id = ?").run(JSON.stringify(head), id);
			}
			if (own) this.db.exec("COMMIT");
		} catch (error) { if (own) this.db.exec("ROLLBACK"); throw error; }
		this.adopt();
	}

	/** Every entry of a chat, in order. */
	load(id: string): { messages: Message[]; activities: AgentActivity[] } {
		const rows = this.statement("SELECT kind, data FROM task_entries WHERE task_id = ? ORDER BY kind, position").all(id) as { kind: Kind; data: string }[];
		const strings = { messages: [] as string[], activities: [] as string[] };
		for (const row of rows) (row.kind === 0 ? strings.messages : strings.activities).push(row.data);
		this.remember(id, strings);
		return { messages: strings.messages.map(value => JSON.parse(value) as Message), activities: strings.activities.map(value => JSON.parse(value) as AgentActivity) };
	}

	/** Writes the entries that differ from what is stored and drops any past the new end. Run inside the save's transaction. */
	save(task: Task, offsets?: EntryOffsets) {
		let previous = this.saved.get(task.id);
		if (offsets) {
			// A tail: compare with the stored rows from the same positions on.
			const read = (kind: Kind, from: number) => (this.statement("SELECT data FROM task_entries WHERE task_id = ? AND kind = ? AND position >= ? ORDER BY position").all(task.id, kind, from) as { data: string }[]).map(row => row.data);
			const before = previous ? { messages: previous.messages.slice(offsets.messages), activities: previous.activities.slice(offsets.activities) } : { messages: read(0, offsets.messages), activities: read(1, offsets.activities) };
			const after = this.write(task, before, offsets);
			if (previous) this.remember(task.id, { messages: [...previous.messages.slice(0, offsets.messages), ...after.messages], activities: [...previous.activities.slice(0, offsets.activities), ...after.activities] });
			return;
		}
		if (!previous) {
			const rows = this.statement("SELECT kind, data FROM task_entries WHERE task_id = ? ORDER BY kind, position").all(task.id) as { kind: Kind; data: string }[];
			previous = { messages: [], activities: [] };
			for (const row of rows) (row.kind === 0 ? previous.messages : previous.activities).push(row.data);
		}
		this.remember(task.id, this.write(task, previous));
	}

	/**
	 * The latest turn of a chat: messages from `fromMessageId` on and activities from that turn's first on, with where
	 * they start. Streaming rewrites only these, so a flush costs the same in a long chat as in a new one.
	 */
	tail(id: string, fromMessageId: string): { messages: Message[]; activities: AgentActivity[]; offsets: EntryOffsets } | undefined {
		const start = (this.statement("SELECT min(position) AS position FROM task_entries WHERE task_id = ? AND kind = 0 AND id = ?").get(id, fromMessageId) as { position: number | null }).position;
		if (start === null) return undefined;
		const first = (this.statement("SELECT min(position) AS position FROM task_entries WHERE task_id = ? AND kind = 1 AND owner = ?").get(id, fromMessageId) as { position: number | null }).position ?? this.count(id, 1);
		const rows = (kind: Kind, from: number) => (this.statement("SELECT data FROM task_entries WHERE task_id = ? AND kind = ? AND position >= ? ORDER BY position").all(id, kind, from) as { data: string }[]).map(row => JSON.parse(row.data));
		return { messages: rows(0, start), activities: rows(1, first), offsets: { messages: start, activities: first } };
	}

	/** Writes changed entries from `offsets` on (the start when absent), drops any past the new end, and returns what is now stored there. */
	private write(task: Task, previous: { messages: string[]; activities: string[] }, offsets: EntryOffsets = { messages: 0, activities: 0 }) {
		// An activity belongs to a turn when its id is `<user message id>:<step>`.
		const users = new Set((task.messages ?? []).filter(message => message.role === "user").map(message => message.id));
		// A tail holds only its own turns; an activity of an earlier turn finds its owner among the stored messages.
		const isUser = (id: string) => users.has(id) || (offsets.messages > 0 && Boolean(this.statement("SELECT 1 FROM task_entries WHERE task_id = ? AND kind = 0 AND id = ? AND role = 'user'").get(task.id, id)));
		const owner = (id: string) => { const prefix = id.slice(0, Math.max(0, id.indexOf(":"))); return prefix && isUser(prefix) ? prefix : null; };
		const upsert = this.statement(`INSERT INTO task_entries (task_id, kind, position, id, owner, timeline_order, role, bytes, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (task_id, kind, position) DO UPDATE SET id = excluded.id, owner = excluded.owner, timeline_order = excluded.timeline_order, role = excluded.role, bytes = excluded.bytes, data = excluded.data`);
		const next = { messages: [] as string[], activities: [] as string[] };
		for (const [name, kind] of kinds) {
			const entries = (task[name] ?? []) as (Message | AgentActivity)[], before = previous[name], after = next[name], offset = offsets[name];
			for (let index = 0; index < entries.length; index++) {
				const entry = entries[index], data = JSON.stringify(entry);
				after.push(data);
				if (before[index] === data) continue;
				upsert.run(task.id, kind, offset + index, entry.id, kind === 1 ? owner(entry.id) : null, entry.timelineOrder ?? null, kind === 0 ? (entry as Message).role : null, encoder.encode(data).byteLength, data);
			}
			if (before.length > entries.length) this.statement("DELETE FROM task_entries WHERE task_id = ? AND kind = ? AND position >= ?").run(task.id, kind, offset + entries.length);
		}
		return next;
	}

	count(id: string, kind: Kind) { return Number((this.statement("SELECT count(*) AS count FROM task_entries WHERE task_id = ? AND kind = ?").get(id, kind) as { count: number }).count); }

	/** One page, with the same window and byte rules as conversationPageOf, read from the rows it covers. */
	page(query: ConversationPageQuery, revision: number): ConversationPage {
		const kind: Kind = query.kind === "messages" ? 0 : 1, total = this.count(query.taskId, kind), cursor = query.beforeId ?? query.afterId ?? query.fromId;
		const anchor = cursor === undefined ? -1 : Number((this.statement("SELECT min(position) AS position FROM task_entries WHERE task_id = ? AND kind = ? AND id = ?").get(query.taskId, kind, cursor) as { position: number | null }).position ?? -1);
		if (cursor !== undefined && anchor < 0) throw new Error("Conversation position no longer exists. Reload the latest history.");
		const end = query.beforeId ? anchor : query.afterId ? Math.min(total, anchor + 1 + query.limit) : query.fromId ? Math.min(total, anchor + query.limit) : total;
		const start = query.afterId ? anchor + 1 : query.fromId ? anchor : Math.max(0, end - query.limit);
		const rows = this.statement("SELECT position, bytes, data FROM task_entries WHERE task_id = ? AND kind = ? AND position >= ? AND position < ? ORDER BY position").all(query.taskId, kind, start, end) as { position: number; bytes: number; data: string }[];
		// Keep the cursor-adjacent contiguous window, including one oversized entry.
		const forward = Boolean(query.afterId || query.fromId), ordered = forward ? rows : [...rows].reverse(), kept: typeof rows = [];
		let bytes = 0;
		for (const row of ordered) { bytes += row.bytes + 1; if (kept.length && bytes > conversationPageBytes - 1) break; kept.push(row); }
		if (!forward) kept.reverse();
		const from = kept.length ? kept[0].position : start, to = kept.length ? kept.at(-1)!.position + 1 : end;
		return { kind: query.kind, entries: kept.map(row => JSON.parse(row.data)), earlier: from, later: total - to, revision };
	}

	/** The activities of a page of messages' turns: those owned by its user messages, plus unowned ones by position. */
	turnActivities(id: string, page: ConversationPage): AgentActivity[] {
		const window = page.entries as Message[], users = window.filter(message => message.role === "user").map(message => message.id);
		const next = (this.statement("SELECT timeline_order FROM task_entries WHERE task_id = ? AND kind = 0 AND position = ?").get(id, page.earlier + window.length) as { timeline_order: number | null } | undefined)?.timeline_order ?? undefined;
		// Two lookups on the owner index: the window's turns, and activities that belong to no turn.
		const owned = this.statement("SELECT position, data FROM task_entries WHERE task_id = ? AND kind = 1 AND owner IN (SELECT value FROM json_each(?))").all(id, JSON.stringify(users)) as { position: number; data: string }[];
		const unowned = this.statement("SELECT position, data FROM task_entries WHERE task_id = ? AND kind = 1 AND owner IS NULL").all(id) as { position: number; data: string }[];
		const rows = [...owned, ...unowned].sort((a, b) => a.position - b.position);
		return activitiesForWindow(window, rows.map(row => JSON.parse(row.data) as AgentActivity), new Set(users), { next, latest: page.later === 0 });
	}
}
