import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { zstdCompressSync } from "node:zlib";
import path from "node:path";
import { claudeUsage, codexResponseUsage } from "./harnessUsage";
import { codexSession, readTranscript, TranscriptScanner, transcriptFolders, transcriptLine, type TranscriptFile, type TranscriptUsage } from "./usageTranscripts";
import { usageTokens } from "../shared/usageAmounts";
import { estimateNanos, modelMatchKey } from "../shared/usageLedger";

describe("harness usage", () => {
	it("reads a Claude response's usage, cache reads and writes apart from the input", () => {
		expect(claudeUsage("msg_1", "claude-opus-5-5", { input_tokens: 12, cache_read_input_tokens: 9000, cache_creation_input_tokens: 400, output_tokens: 300 }))
			.toEqual({ key: "claude:msg_1", model: "claude-opus-5-5", input: 12, cached: 9000, cacheWrite: 400, output: 300, reasoning: 0 });
		// The end of a streamed message carries only its output.
		expect(claudeUsage("msg_1", undefined, { output_tokens: 320 })).toEqual({ key: "claude:msg_1", input: 0, cached: 0, cacheWrite: 0, output: 320, reasoning: 0 });
		expect(claudeUsage("msg_2", undefined, { input_tokens: 0, output_tokens: 0 })).toBeUndefined();
		expect(claudeUsage("msg_3", undefined, null)).toBeUndefined();
	});

	it("keys each Codex response by its thread and running total", () => {
		expect(codexResponseUsage("thread", { total_tokens: 90_500 }, { input_tokens: 0, output_tokens: 0 })).toBeUndefined();
		const state = {};
		expect(transcriptLine("codex", JSON.stringify({ timestamp: "2026-10-21T19:20:46Z", type: "session_meta", payload: { id: "thread", cwd: "E:\\phaseo" } }), state)).toBeUndefined();
		transcriptLine("codex", JSON.stringify({ timestamp: "2026-10-21T19:21:46Z", type: "turn_context", payload: { model: "gpt-6.1-sol", cwd: "E:\\phaseo" } }), state);
		const line = JSON.stringify({ timestamp: "2026-10-21T19:21:55Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 90_000, cached_input_tokens: 30_000, output_tokens: 500, total_tokens: 90_500 }, last_token_usage: { input_tokens: 40_000, cached_input_tokens: 30_000, output_tokens: 200, reasoning_output_tokens: 50, total_tokens: 40_200 } } } });
		expect(transcriptLine("codex", line, state)).toEqual({ key: "codex:thread:90500", model: "gpt-6.1-sol", input: 10_000, cached: 30_000, cacheWrite: 0, output: 200, reasoning: 50, at: "2026-10-21T19:21:55Z", harness: "codex", sessionId: "thread", cwd: "E:\\phaseo" });
	});

	it("keys a Codex fork's responses by the session its chain started from, so lines it copied count once", () => {
		const known = new Map<string, string>(), roots = { rootOf: (id: string) => known.get(id), remember: (id: string, root: string) => { known.set(id, root); } };
		const meta = (id: string, parent?: string) => JSON.stringify({ timestamp: "2026-10-02T08:18:20Z", type: "session_meta", payload: { id, ...parent ? { forked_from_id: parent } : {} } });
		const count = (total: number) => JSON.stringify({ timestamp: "2026-10-02T08:20:30Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: total }, last_token_usage: { input_tokens: 90, output_tokens: 10 } } } });
		const parent = {}, fork = {}, grandchild = {};
		transcriptLine("codex", meta("parent"), parent, roots);
		expect(transcriptLine("codex", count(100), parent, roots)?.key).toBe("codex:parent:100");
		// The fork's file starts with its own meta, then its parent's copied meta and usage lines.
		transcriptLine("codex", meta("fork", "parent"), fork, roots);
		transcriptLine("codex", meta("parent"), fork, roots);
		expect(transcriptLine("codex", count(100), fork, roots)).toMatchObject({ key: "codex:parent:100", sessionId: "fork" });
		expect(transcriptLine("codex", count(200), fork, roots)?.key).toBe("codex:parent:200");
		transcriptLine("codex", meta("grandchild", "fork"), grandchild, roots);
		expect(transcriptLine("codex", count(100), grandchild, roots)?.key).toBe("codex:parent:100");
	});

	it("reads Claude Code transcript lines by response, skipping its synthetic messages", () => {
		const line = (model: string) => JSON.stringify({ type: "assistant", timestamp: "2026-10-12T20:30:58Z", sessionId: "session", cwd: "E:\\phaseo", message: { id: "msg_1", model, usage: { input_tokens: 2, cache_creation_input_tokens: 13_941, cache_read_input_tokens: 73_202, output_tokens: 237, output_tokens_details: { thinking_tokens: 72 } } } });
		expect(transcriptLine("claude", line("claude-opus-5-5"), {})).toMatchObject({ key: "claude:msg_1", model: "claude-opus-5-5", input: 2, cached: 73_202, cacheWrite: 13_941, output: 237, reasoning: 72, sessionId: "session" });
		expect(transcriptLine("claude", line("<synthetic>"), {})).toBeUndefined();
		expect(transcriptLine("claude", JSON.stringify({ type: "user", message: { content: "usage" } }), {})).toBeUndefined();
	});

	it("reads only what a transcript gained, whole lines at a time, and starts again when it shrinks", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-transcripts-")), file = path.join(directory, "session.jsonl");
		try {
			const line = (id: string) => JSON.stringify({ type: "assistant", timestamp: "2026-10-12T20:30:58Z", sessionId: "s", message: { id, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 } } });
			writeFileSync(file, `${line("a")}\n${line("b").slice(0, 20)}`);
			const read: string[] = [], collect = (rows: { key: string }[]) => read.push(...rows.map(row => row.key));
			let state = await readTranscript(file, "claude", undefined, statSync(file).size, 1, collect);
			expect([read, state.offset]).toEqual([["claude:a"], line("a").length + 1]);
			writeFileSync(file, `${line("a")}\n${line("b")}\n`);
			state = await readTranscript(file, "claude", state, statSync(file).size, 2, collect);
			expect(read).toEqual(["claude:a", "claude:b"]);
			writeFileSync(file, `${line("c")}\n`);
			await readTranscript(file, "claude", state, statSync(file).size, 3, collect);
			expect(read).toEqual(["claude:a", "claude:b", "claude:c"]);
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});

	it("reads Codex's compressed sessions whole", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-transcripts-")), file = path.join(directory, "rollout.jsonl.zst");
		try {
			const lines = [{ timestamp: "2026-10-01T10:00:00Z", type: "session_meta", payload: { id: "old" } }, { timestamp: "2026-10-01T10:00:01Z", type: "turn_context", payload: { model: "gpt-6-sol" } },
				...[100, 250].map(total => ({ timestamp: "2026-10-01T10:00:02Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: total }, last_token_usage: { input_tokens: 80, output_tokens: 20 } } } }))];
			writeFileSync(file, zstdCompressSync(Buffer.from(lines.map(line => JSON.stringify(line)).join("\n"))));
			const read: string[] = [];
			const state = await readTranscript(file, "codex", undefined, statSync(file).size, 1, rows => read.push(...rows.map(row => `${row.key} ${row.model}`)));
			expect(read).toEqual(["codex:old:100 gpt-6-sol", "codex:old:250 gpt-6-sol"]);
			expect(state.offset).toBe(statSync(file).size);
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});

	it("skips Codex lines that aren't usage unread, and reads lines longer than a chunk", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-transcripts-"));
		try {
			const codex = path.join(directory, "rollout.jsonl"), claude = path.join(directory, "session.jsonl"), output = "x".repeat(5 * 1024 * 1024);
			writeFileSync(codex, [{ timestamp: "2026-10-01T10:00:00Z", type: "session_meta", payload: { id: "s" } },
				// A tool's output that mentions token_count, megabytes long: not a usage line.
				{ timestamp: "2026-10-01T10:00:01Z", type: "response_item", payload: { type: "function_call_output", output: `"type":"token_count" ${output}` } },
				{ timestamp: "2026-10-01T10:00:02Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: 100 }, last_token_usage: { input_tokens: 80, output_tokens: 20 } } } }].map(line => JSON.stringify(line)).join("\n") + "\n");
			writeFileSync(claude, `${JSON.stringify({ type: "assistant", timestamp: "2026-10-12T20:30:58Z", sessionId: "c", message: { id: "long", model: "claude-opus-5-5", content: [{ type: "text", text: output }], usage: { input_tokens: 1, output_tokens: 7 } } })}\n`);
			const read: string[] = [], collect = (rows: { key: string }[]) => read.push(...rows.map(row => row.key));
			const codexRead = await readTranscript(codex, "codex", undefined, statSync(codex).size, 1, collect);
			const claudeRead = await readTranscript(claude, "claude", undefined, statSync(claude).size, 1, collect);
			expect(read).toEqual(["codex:s:100", "claude:long"]);
			expect([codexRead.offset, claudeRead.offset]).toEqual([statSync(codex).size, statSync(claude).size]);
			expect(codexSession(codex)).toEqual({ id: "s" });
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});

	it("roots a Codex fork's chain before reading, so a fork read before its parent still keys by the root", async () => {
		const home = mkdtempSync(path.join(tmpdir(), "phaseo-codex-")), sessions = path.join(home, "sessions");
		try {
			mkdirSync(sessions);
			const meta = (id: string, parent?: string) => ({ timestamp: "2026-10-02T08:18:20Z", type: "session_meta", payload: { id, ...parent ? { forked_from_id: parent } : {} } });
			const count = (total: number) => ({ timestamp: new Date().toISOString(), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: total }, last_token_usage: { input_tokens: 90, output_tokens: 10 } } } });
			const files = { "grandchild.jsonl.zst": [meta("grandchild", "fork"), meta("fork", "parent"), count(100), count(300)], "fork.jsonl": [meta("fork", "parent"), meta("parent"), count(100), count(200)], "parent.jsonl.zst": [meta("parent"), count(100)] };
			// Newest first is the order files are read in: here the grandchild, then the fork, then the parent.
			Object.entries(files).forEach(([name, lines], index) => {
				const file = path.join(sessions, name), text = lines.map(line => JSON.stringify(line)).join("\n") + "\n", at = new Date(Date.now() - (index + 1) * 60_000);
				writeFileSync(file, name.endsWith(".zst") ? zstdCompressSync(Buffer.from(text)) : text);
				utimesSync(file, at, at);
			});
			const roots = new Map<string, string>(), saved = new Map<string, TranscriptFile>(), keys: string[] = [];
			const store = {
				getAccounts: () => [], getProjects: () => [], addedTranscriptFolders: () => [], sessionOwners: () => new Map(),
				transcriptFile: (file: string) => saved.get(file), saveTranscriptFile: (file: string, value: TranscriptFile) => { saved.set(file, value); },
				recordTranscriptUsage: (rows: readonly TranscriptUsage[]) => { keys.push(...rows.map(row => row.key)); }, sumStaleQuarters: () => false,
				threadRoots: { rootOf: (id: string) => roots.get(id), remember: (id: string, root: string) => { roots.set(id, root); } },
			};
			const scanner = new TranscriptScanner(store, () => {}, { folders: () => [{ harness: "codex", directory: home }] });
			expect(await scanner.scan(true)).toBe(5);
			expect(new Set(keys)).toEqual(new Set(["codex:parent:100", "codex:parent:200", "codex:parent:300"]));
			expect(Object.fromEntries(roots)).toEqual({ grandchild: "parent", fork: "parent", parent: "parent" });
			// Nothing changed, so another scan reads nothing.
			expect(await scanner.scan(true)).toBe(0);
		} finally { rmSync(home, { recursive: true, force: true }); }
	});

	it("finds transcript folders once each: defaults, the environment's, accounts' and added ones", () => {
		const folders = transcriptFolders([{ id: "a", name: "Work", harness: "claude", kind: "native", configured: true, configDirectory: "D:\\claude-work" }], [{ harness: "claude", directory: "D:\\Claude-Work" }, { harness: "codex", directory: "E:\\CodexHome" }], { CODEX_HOME: "E:\\CodexHome" }, "C:\\Users\\me");
		expect(folders.map(folder => `${folder.harness} ${folder.directory}${folder.added ? " (added)" : ""}`)).toEqual(["claude C:\\Users\\me\\.claude", "codex C:\\Users\\me\\.codex", "codex E:\\CodexHome", "claude D:\\claude-work"]);
	});

	it("reads Phaseo reports' cached input either way providers count it", () => {
		expect(usageTokens(JSON.stringify({ prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 }, completion_tokens_details: { reasoning_tokens: 20 } })))
			.toEqual({ input: 200, cached: 800, cacheWrite: 0, output: 50, reasoning: 20 });
		expect(usageTokens(JSON.stringify({ input_tokens: 10, cache_read_input_tokens: 800, cache_creation_input_tokens: 100, output_tokens: 50 }))).toEqual({ input: 10, cached: 800, cacheWrite: 100, output: 50, reasoning: 0 });
		expect(usageTokens("Used 3k tokens")).toBeUndefined();
	});

	it("prices tokens with cache rates falling back to the input price, and matches harness model ids to the catalogue", () => {
		expect(estimateNanos({ input: 1_000_000, cached: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000, reasoning: 500_000 }, { input: 5, output: 25, cacheRead: 0.5 })).toBe(35.5e9);
		expect(modelMatchKey("claude-opus-5-5-20261001")).toBe(modelMatchKey("anthropic/claude-opus-5.5"));
		expect(modelMatchKey("gpt-6.1")).toBe(modelMatchKey("openai/gpt-6.1"));
		expect(modelMatchKey("claude-fable-5-1[1m]")).toBe(modelMatchKey("anthropic/claude-fable-5.1"));
	});
});
