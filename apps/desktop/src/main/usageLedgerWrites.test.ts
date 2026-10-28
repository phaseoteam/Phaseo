import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceStore } from "./workspaceStore";
import { serveTranscriptWrites } from "./usageLedgerWrites";
import type { TranscriptUsage } from "./usageTranscripts";

/** A writer worker's side of its port, driven here: requests go in, replies are collected. */
function writer(database: string) {
	const port = new EventEmitter() as EventEmitter & { postMessage(value: unknown): void }, replies: unknown[] = [];
	port.postMessage = value => { replies.push(value); };
	const close = serveTranscriptWrites(port, database);
	return { send: (request: unknown) => { port.emit("message", request); }, replies, close };
}

describe("transcript writer", () => {
	it("writes rows and files on its own connection in order, and once a write fails saves nothing more and says so", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-writer-")), filename = path.join(directory, "workspace.db");
		const store = new WorkspaceStore(filename), { send, replies, close } = writer(filename);
		try {
			const now = new Date(), at = new Date(now.getTime() - 3_600_000).toISOString(), cutoff = new Date(now.getTime() - 91 * 86_400_000).toISOString();
			const row = (key: string, output: number): TranscriptUsage => ({ key, model: "gpt-6.1-sol", input: 10, cached: 0, cacheWrite: 0, output, reasoning: 0, at, harness: "codex", sessionId: "t", cwd: "E:\\work\\site" });
			const file = { size: 10, mtimeMs: 1, offset: 10, state: {} };
			send({ begin: { owners: [["codex:t", { id: "chat-1" }]], projects: [], cutoff } });
			send({ rows: [row("codex:t:1", 90), row("codex:t:2", 40)] });
			send({ file: "a.jsonl", value: file });
			send({ sum: 24, id: 0 });
			expect(replies).toEqual([{ id: 0, more: false }]);
			// The store's connection sees what the writer's wrote, summed and under the chat that owns the session.
			const report = store.usageReport("7d", () => undefined, now);
			expect(report.total.tokens).toBe(150);
			expect(store.transcriptFile("a.jsonl")).toEqual(file);
			// A row that can't be written: the file after it isn't marked read, and the next sum reports the failure.
			send({ rows: [{ ...row("codex:t:3", 5), key: {} as unknown as string }] });
			send({ file: "b.jsonl", value: file });
			send({ sum: 24, id: 1 });
			expect(replies[1]).toMatchObject({ id: 1, failed: expect.any(String) });
			expect(store.transcriptFile("b.jsonl")).toBeUndefined();
			// A new scan starts afresh.
			send({ begin: { owners: [], projects: [], cutoff } });
			send({ file: "b.jsonl", value: file });
			send({ sum: 24, id: 2 });
			expect(replies[2]).toEqual({ id: 2, more: false });
			expect(store.transcriptFile("b.jsonl")).toEqual(file);
		} finally { close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
