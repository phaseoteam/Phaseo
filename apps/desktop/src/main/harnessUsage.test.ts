import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claudeUsage, codexUsage } from "./harnessUsage";
import { readTranscript, transcriptFolders, transcriptLine } from "./usageTranscripts";
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

	it("keys each Codex response by its thread's running total, live and in its session files alike", () => {
		const live = { total: { inputTokens: 90_000, cachedInputTokens: 30_000, outputTokens: 500, reasoningOutputTokens: 0, totalTokens: 90_500 }, last: { inputTokens: 40_000, cachedInputTokens: 30_000, outputTokens: 200, reasoningOutputTokens: 50, totalTokens: 40_200 } };
		expect(codexUsage("thread", live)).toEqual({ key: "codex:thread:90500", input: 10_000, cached: 30_000, cacheWrite: 0, output: 200, reasoning: 50 });
		expect(codexUsage(undefined, live)).toBeUndefined();
		const state = {};
		expect(transcriptLine("codex", JSON.stringify({ timestamp: "2026-10-21T19:20:46Z", type: "session_meta", payload: { id: "thread", cwd: "E:\\phaseo" } }), state)).toBeUndefined();
		transcriptLine("codex", JSON.stringify({ timestamp: "2026-10-21T19:21:46Z", type: "turn_context", payload: { model: "gpt-6.1-sol", cwd: "E:\\phaseo" } }), state);
		const line = JSON.stringify({ timestamp: "2026-10-21T19:21:55Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 90_000, cached_input_tokens: 30_000, output_tokens: 500, total_tokens: 90_500 }, last_token_usage: { input_tokens: 40_000, cached_input_tokens: 30_000, output_tokens: 200, reasoning_output_tokens: 50, total_tokens: 40_200 } } } });
		expect(transcriptLine("codex", line, state)).toEqual({ key: "codex:thread:90500", model: "gpt-6.1-sol", input: 10_000, cached: 30_000, cacheWrite: 0, output: 200, reasoning: 50, at: "2026-10-21T19:21:55Z", harness: "codex", sessionId: "thread", cwd: "E:\\phaseo" });
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
