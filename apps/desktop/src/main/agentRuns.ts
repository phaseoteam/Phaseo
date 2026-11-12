import type { DatabaseSync, StatementSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { AgentItem, AgentRunResult, AgentStepRecord, AgentStepResult, AgentToolCall, AgentToolExecutionResult } from "@phaseo/agent-sdk";
import { packText, unpackText } from "./taskEntries";
import { recordIfSlow } from "./diagnostics/tracer";

const SLOW_SAVE_MS = 50;
/** A message's rowid is its run's key × 2^24 + its position, so a run's messages are one rowid range, as in TaskEntries. */
const runSpan = 2 ** 24;

/**
 * Phaseo runs, kept so a stopped or paused run can continue. `agent_run_heads` holds the run without its messages,
 * with status and step count as columns so a turn start reads them without parsing. Each message is one row of
 * `agent_run_messages`; a save writes only the positions that changed. Version 4 kept one JSON row per run
 * (`agent_runs`), which held every tool output about five times and was rewritten on every step; it is dropped.
 */
export const agentRunsSchema = `CREATE TABLE IF NOT EXISTS agent_run_heads (key INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, task_id TEXT, status TEXT NOT NULL, step_count INTEGER NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL);
	CREATE INDEX IF NOT EXISTS agent_runs_by_task ON agent_run_heads (task_id) WHERE task_id IS NOT NULL;
	CREATE TABLE IF NOT EXISTS agent_run_messages (hash TEXT NOT NULL, bytes INTEGER NOT NULL, data NOT NULL);
	CREATE TRIGGER IF NOT EXISTS agent_run_messages_removed AFTER DELETE ON agent_run_heads BEGIN DELETE FROM agent_run_messages WHERE rowid >= old.key * ${runSpan} AND rowid < (old.key + 1) * ${runSpan}; END;`;

type Head = { run: Omit<AgentRunResult["run"], "messages">; steps: AgentStepRecord[]; stepResults?: AgentStepResult[] };
const digest = (json: string) => createHash("sha1").update(json).digest("base64");

/**
 * What a head keeps of the steps. Tool output already lives in the messages, so only the step being resumed
 * (`run.stepCount - 1`, the one the loop extends) keeps results, once, in `stepResults`; its step record takes them
 * back on load. Call inputs are the assistant messages' and are restored from them. `items` are derived and not kept.
 */
function lean(result: AgentRunResult): Head {
	const last = result.run.stepCount - 1;
	const calls = (values: AgentToolCall[] | undefined) => values?.map(({ input: _input, ...call }) => call as AgentToolCall);
	const results = (values: AgentToolExecutionResult[] | undefined) => values?.map(({ result: _result, preliminaryResults: _preliminary, ...value }) => value);
	const { messages: _messages, ...run } = result.run;
	return {
		run,
		steps: result.steps.map(step => step.index === last && !result.stepResults ? step : { ...step, toolCalls: step.index === last ? step.toolCalls : calls(step.toolCalls), toolResults: results(step.toolResults) }),
		...(result.stepResults ? { stepResults: result.stepResults.map(({ items: _items, ...step }) => step.stepIndex === last ? step : { ...step, toolCalls: calls(step.toolCalls)!, toolResults: results(step.toolResults)! }) } : {}),
	};
}

export class AgentRuns {
	private readonly statements = new Map<string, StatementSync>();
	/** Each run's stored message hashes by position, so a save compares hashes instead of reading rows. */
	private readonly saved = new Map<string, { key: number; hashes: string[] }>();
	/**
	 * Hashes of message objects already serialised. The loop appends to one array within a call, so a save stringifies
	 * only new messages. Messages are treated as immutable once saved: replace one to change it.
	 */
	private readonly fingerprints = new WeakMap<object, string>();
	constructor(private readonly db: DatabaseSync) {
		if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agent_runs'").get()) { db.exec("DROP TABLE agent_runs"); db.exec("PRAGMA incremental_vacuum"); }
	}
	private statement(sql: string) { let statement = this.statements.get(sql); if (!statement) this.statements.set(sql, statement = this.db.prepare(sql)); return statement; }
	private remember(id: string, value: { key: number; hashes: string[] }) { this.saved.delete(id); this.saved.set(id, value); if (this.saved.size > 32) this.saved.delete(this.saved.keys().next().value!); return value; }
	private readHashes(key: number) {
		const hashes: string[] = [];
		for (const row of this.statement("SELECT rowid, hash FROM agent_run_messages WHERE rowid >= ? AND rowid < ? ORDER BY rowid").all(key * runSpan, (key + 1) * runSpan)) hashes[(row.rowid as number) - key * runSpan] = row.hash as string;
		return hashes;
	}

	status(id: string): { status: string; stepCount: number } | null {
		const row = this.statement("SELECT status, step_count FROM agent_run_heads WHERE id = ?").get(id);
		return row ? { status: row.status as string, stepCount: row.step_count as number } : null;
	}

	load(id: string): AgentRunResult | null {
		const head = this.statement("SELECT key, data FROM agent_run_heads WHERE id = ?").get(id) as { key: number; data: string } | undefined;
		if (!head) return null;
		const rows = this.statement("SELECT hash, data FROM agent_run_messages WHERE rowid >= ? AND rowid < ? ORDER BY rowid").all(head.key * runSpan, (head.key + 1) * runSpan) as { hash: string; data: string | Uint8Array }[];
		const messages = rows.map(row => { const message = JSON.parse(unpackText(row.data)); this.fingerprints.set(message, row.hash); return message; });
		this.remember(id, { key: head.key, hashes: rows.map(row => row.hash) });
		const { run, steps, stepResults } = JSON.parse(head.data) as Head;
		const inputs = new Map<string, unknown>();
		for (const message of messages) if (message.role === "assistant") for (const call of message.toolCalls ?? []) inputs.set(call.id, call.input);
		const restore = (calls: AgentToolCall[] | undefined) => calls?.map((call): AgentToolCall => Object.hasOwn(call, "input") ? call : { ...call, input: inputs.get(call.id) });
		const full = { ...run, messages } as AgentRunResult["run"];
		const resumed = stepResults?.map(step => ({ ...step, toolCalls: restore(step.toolCalls)! })), last = resumed?.find(step => step.stepIndex === run.stepCount - 1);
		const outputs = new Map(last?.toolResults.map(value => [value.toolCallId, value]));
		const withOutput = (values: AgentToolExecutionResult[] | undefined) => values?.map(value => { const kept = outputs.get(value.toolCallId); return kept && !("result" in value) ? { ...value, ...("result" in kept ? { result: kept.result } : {}), ...(kept.preliminaryResults ? { preliminaryResults: kept.preliminaryResults } : {}) } : value; });
		// Items are derived; only the resumed step's tool results and the output survive to rebuild them from.
		const items: AgentItem[] = (last?.toolResults ?? []).map(value => value.error ? { type: "error", message: value.error, toolCallId: value.toolCallId, toolName: value.toolName } : { type: "tool_result", toolCallId: value.toolCallId, name: value.toolName, output: value.result });
		if (run.result !== undefined) items.push({ type: "output", value: run.result });
		return { run: full, steps: steps.map(step => ({ ...step, toolCalls: restore(step.toolCalls), ...(step.index === run.stepCount - 1 && step.toolResults ? { toolResults: withOutput(step.toolResults) } : {}) })), ...(resumed ? { stepResults: resumed } : {}), usage: run.usage, output: run.result, messages, items };
	}

	/**
	 * Writes the head and the messages that changed, in one transaction (a savepoint inside a caller's), and returns the
	 * bytes written. With `taskId` the task's other runs are deleted: a task resumes only its latest (`nativeSessionId`).
	 */
	save(result: AgentRunResult, taskId?: string): number {
		const run = result.run, messages = run.messages ?? [], own = !this.db.isTransaction, started = performance.now();
		let written = 0, changed = 0;
		this.db.exec(own ? "BEGIN IMMEDIATE" : "SAVEPOINT save_agent_run");
		try {
			const head = JSON.stringify(lean(result));
			written += Buffer.byteLength(head);
			const { key } = this.statement(`INSERT INTO agent_run_heads (id, task_id, status, step_count, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET task_id = coalesce(excluded.task_id, task_id), status = excluded.status, step_count = excluded.step_count, updated_at = excluded.updated_at, data = excluded.data
				RETURNING key`).get(run.id, taskId ?? null, run.status, run.stepCount, run.updatedAt ?? new Date().toISOString(), head) as { key: number };
			let stored = this.saved.get(run.id);
			if (stored?.key !== key) stored = this.remember(run.id, { key, hashes: this.readHashes(key) });
			const write = this.statement("INSERT OR REPLACE INTO agent_run_messages (rowid, hash, bytes, data) VALUES (?, ?, ?, ?)");
			for (let index = 0; index < messages.length; index++) {
				const message = messages[index] as object;
				let hash = this.fingerprints.get(message), json: string | undefined;
				if (hash === undefined) { json = JSON.stringify(message); hash = digest(json); this.fingerprints.set(message, hash); }
				if (stored.hashes[index] === hash) continue;
				const packed = packText(json ?? JSON.stringify(message));
				write.run(key * runSpan + index, hash, packed.bytes, packed.stored);
				stored.hashes[index] = hash; written += packed.bytes; changed++;
			}
			// History rewritten shorter (compaction, a repaired resume) leaves no stale tail.
			if (stored.hashes.length > messages.length) { this.statement("DELETE FROM agent_run_messages WHERE rowid >= ? AND rowid < ?").run(key * runSpan + messages.length, (key + 1) * runSpan); stored.hashes.length = messages.length; }
			if (taskId) for (const row of this.statement("DELETE FROM agent_run_heads WHERE task_id = ? AND id <> ? RETURNING id").all(taskId, run.id)) this.saved.delete(row.id as string);
			this.db.exec(own ? "COMMIT" : "RELEASE save_agent_run");
		} catch (error) {
			this.db.exec(own ? "ROLLBACK" : "ROLLBACK TO save_agent_run; RELEASE save_agent_run");
			this.saved.delete(run.id);
			if (own) recordIfSlow("store.save-agent-run", started, SLOW_SAVE_MS, undefined, error);
			throw error;
		}
		if (own) recordIfSlow("store.save-agent-run", started, SLOW_SAVE_MS, { bytes: written, messages: changed });
		return written;
	}

	/** Deletes a task's runs: those saved with its id, and the one its `nativeSessionId` names. Run before the task row goes. */
	deleteForTask(taskId: string) {
		for (const row of this.statement("DELETE FROM agent_run_heads WHERE task_id = ? OR id = (SELECT json_extract(data, '$.nativeSessionId') FROM tasks WHERE id = ?) RETURNING id").all(taskId, taskId)) this.saved.delete(row.id as string);
	}
}
