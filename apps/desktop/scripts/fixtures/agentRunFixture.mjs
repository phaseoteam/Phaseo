import { inflateRawSync } from "node:zlib";

/** A message's rowid is its run's key × 2^24 + its position (src/main/agentRuns.ts). */
const runSpan = 2 ** 24;

/**
 * A saved Phaseo run as the recovery audits read it: the head from `agent_run_heads` with its messages put back from
 * `agent_run_messages` (large ones are deflated, as taskEntries' packText stores them). Undefined if there is none.
 */
export function readAgentRun(db, id) {
	const head = db.prepare("SELECT key, data FROM agent_run_heads WHERE id = ?").get(id);
	if (!head) return undefined;
	const saved = JSON.parse(head.data);
	const messages = db.prepare("SELECT data FROM agent_run_messages WHERE rowid >= ? AND rowid < ? ORDER BY rowid").all(head.key * runSpan, (head.key + 1) * runSpan)
		.map(row => JSON.parse(typeof row.data === "string" ? row.data : inflateRawSync(row.data).toString("utf8")));
	return { ...saved, run: { ...saved.run, messages } };
}
