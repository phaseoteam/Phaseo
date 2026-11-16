import type { CompletionResult } from "@/features/chat/transport";
import { costOf, newIssueUrl, runTriage, stepLabel, triagePrompt, type TriageBuild } from "./agent";
import { SourceReader } from "./source";

jest.mock("@/features/chat/transport", () => ({ streamRequestBody: jest.fn() }));

const SHA = "a".repeat(40);
const FILES: Record<string, string> = {
  "apps/mobile/src/features/chat/runner.ts": "const a = 1;\nexport function stopChat() {\n  return broken;\n}\n",
  "apps/mobile/src/lib/format.ts": "export const x = 2;\n",
};
const TREE = [
  { path: "src", type: "tree" },
  { path: "src/features/chat/runner.ts", type: "blob", size: 60 },
  { path: "src/lib/format.ts", type: "blob", size: 20 },
  { path: "src/logo.png", type: "blob", size: 900 },
];

type Reply = { ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> };
const failed: Reply = { ok: false, status: 500, text: async () => "", json: async () => ({}) };

function fakeGitHub() {
  const calls: string[] = [];
  const fetcher = jest.fn(async (url: string): Promise<Reply> => {
    calls.push(url);
    const reply = (status: number, body: unknown): Reply => ({ ok: status < 400, status, text: async () => String(body), json: async () => body });
    if (url.startsWith("https://api.github.com/")) {
      if (url.includes("git/trees/")) return reply(200, { tree: TREE });
      if (url.includes("/commits?")) return reply(200, [{ sha: "b".repeat(40), commit: { message: "fix(mobile): a thing\n\nmore", author: { date: "2026-11-12T10:00:00Z" } } }]);
      return reply(404, {});
    }
    const path = url.split(`/${SHA}/`)[1] ?? "";
    return path in FILES ? reply(200, FILES[path]) : reply(404, "");
  });
  return { fetcher, calls };
}

describe("SourceReader", () => {
  it("reads numbered lines from raw files at the commit", async () => {
    const { fetcher, calls } = fakeGitHub();
    const source = new SourceReader(SHA, fetcher);
    const text = await source.read("apps/mobile/src/features/chat/runner.ts", 2, 3);
    expect(text).toContain("lines 2–3 of 5");
    expect(text).toContain("3\t  return broken;");
    expect(calls[0]).toBe(`https://raw.githubusercontent.com/phaseoteam/Phaseo/${SHA}/apps/mobile/src/features/chat/runner.ts`);
  });

  it("searches text files under the folders with one listing per folder and caches files", async () => {
    const { fetcher, calls } = fakeGitHub();
    const source = new SourceReader(SHA, fetcher);
    const found = await source.search("return\\s+broken", ["apps/mobile"]);
    expect(found).toContain("apps/mobile/src/features/chat/runner.ts:3: return broken;");
    expect(calls.filter((url) => url.includes("git/trees/"))).toEqual([`https://api.github.com/repos/phaseoteam/Phaseo/git/trees/${encodeURIComponent(`${SHA}:apps/mobile`)}?recursive=1`]);
    expect(calls.some((url) => url.endsWith(".png"))).toBe(false);
    await source.search("stopChat", ["apps/mobile"]);
    expect(calls.filter((url) => url.includes("runner.ts"))).toHaveLength(1);
  });

  it("tells whether the commit is on GitHub", async () => {
    const { fetcher } = fakeGitHub();
    FILES["package.json"] = "{}";
    expect(await new SourceReader(SHA, fetcher).exists()).toBe(true);
    expect(await new SourceReader("c".repeat(40), fetcher).exists()).toBe(false);
    delete FILES["package.json"];
  });

  it("explains GitHub's limit when listings run out", async () => {
    const source = new SourceReader(SHA, async () => ({ ok: false, status: 403, text: async () => "", json: async () => ({}) }));
    await expect(source.list("apps")).rejects.toThrow(/60 folder listings an hour/);
  });
});

const BUILD: TriageBuild = { app: "Phaseo for Android", version: "0.1.0", buildNumber: 3110, commit: SHA, dirty: false, device: "samsung SM-A536B", os: "Android 15 (API 35)" };

describe("runTriage", () => {
  it("runs tools until the model answers, keeps the draft and never sends tools on the last word", async () => {
    const { fetcher } = fakeGitHub();
    const replies: Partial<CompletionResult>[] = [
      { text: "", toolCalls: [{ id: "1", name: "search_code", arguments: JSON.stringify({ pattern: "broken" }) }], usage: { cost: 0.01 } },
      { text: "", toolCalls: [{ id: "2", name: "read_file", arguments: JSON.stringify({ path: "apps/mobile/src/features/chat/runner.ts" }) }, { id: "3", name: "draft_issue", arguments: JSON.stringify({ title: "Stop throws", body: "Cause: runner.ts:3" }) }], usage: { cost: 0.02 } },
      { text: "The cause is runner.ts line 3.", toolCalls: [], usage: { cost: 0.005 } },
    ];
    const bodies: Record<string, unknown>[] = [];
    const send = jest.fn(async ({ requestBody }: { requestBody: Record<string, unknown> }) => {
      bodies.push(JSON.parse(JSON.stringify(requestBody)) as Record<string, unknown>);
      return { text: "", reasoning: "", toolCalls: [], ...replies.shift() } as CompletionResult;
    });
    const steps: string[] = [];
    const outcome = await runTriage({ report: "Stop crashes", build: BUILD, diagnostics: "", model: "openai/gpt-x", requestFields: { reasoning: { effort: "high" }, provider: { only: ["openai"] }, model: "ignored" }, workspaceId: "w1", source: new SourceReader(SHA, fetcher), signal: new AbortController().signal, onStep: (step) => steps.push(step.label), onText: () => undefined, send: send as never });
    expect(outcome).toEqual({ summary: "The cause is runner.ts line 3.", draft: { title: "Stop throws", body: "Cause: runner.ts:3" }, costUsd: expect.closeTo(0.035, 6), turns: 3 });
    expect(steps).toEqual(["Searched for broken", "Read runner.ts", "Drafted an issue"]);
    const last = bodies[2]!.messages as { role: string; content: string; tool_call_id?: string }[];
    expect(last.filter((message) => message.role === "tool").map((message) => message.tool_call_id)).toEqual(["1", "2", "3"]);
    expect(last.find((message) => message.tool_call_id === "2")?.content).toContain("3\t  return broken;");
    expect(bodies[0]!.tools).toBeDefined();
    expect(bodies[0]).toMatchObject({ model: "openai/gpt-x", reasoning: { effort: "high" }, provider: { only: ["openai"] } });
    expect(bodies[2]!.reasoning).toEqual({ effort: "high" });
  });

  it("tells the model when a tool fails instead of stopping", async () => {
    const { fetcher } = fakeGitHub();
    const replies: Partial<CompletionResult>[] = [
      { toolCalls: [{ id: "1", name: "read_file", arguments: JSON.stringify({ path: "nope.ts" }) }] },
      { text: "Couldn't find it.", toolCalls: [] },
    ];
    let seen = "";
    const send = jest.fn(async ({ requestBody }: { requestBody: { messages: { role: string; content: string }[] } }) => {
      seen = requestBody.messages.at(-1)?.content ?? "";
      return { text: "", reasoning: "", toolCalls: [], ...replies.shift() } as CompletionResult;
    });
    const failed: boolean[] = [];
    const outcome = await runTriage({ report: "x", build: BUILD, diagnostics: "", model: "m", workspaceId: null, source: new SourceReader(SHA, fetcher), signal: new AbortController().signal, onStep: (step) => failed.push(Boolean(step.failed)), onText: () => undefined, send: send as never });
    expect(seen).toBe("nope.ts isn't in the source at this commit.");
    expect(failed).toEqual([true]);
    expect(outcome.draft).toBeNull();
  });
});

describe("runTriage keeps what it learned", () => {
  it("leaves the cost unknown when a turn has no price, and hands over the draft as soon as it's made", async () => {
    const { fetcher } = fakeGitHub();
    const replies: Partial<CompletionResult>[] = [
      { toolCalls: [{ id: "1", name: "draft_issue", arguments: JSON.stringify({ title: "T", body: "B" }) }], usage: { cost: 0.01 } },
      { text: "Done.", toolCalls: [], usage: { prompt_tokens: 5 } },
    ];
    const send = jest.fn(async () => ({ text: "", reasoning: "", toolCalls: [], ...replies.shift() }) as CompletionResult);
    const drafts: unknown[] = [];
    const outcome = await runTriage({ report: "x", build: BUILD, diagnostics: "", model: "m", workspaceId: null, source: new SourceReader(SHA, fetcher), signal: new AbortController().signal, onStep: () => undefined, onText: () => undefined, onDraft: (draft) => drafts.push(draft), send: send as never });
    expect(drafts).toEqual([{ title: "T", body: "B" }]);
    expect(outcome.costUsd).toBeNull();
  });

  it("says which files a search couldn't read, and fails when it read none", async () => {
    const { fetcher } = fakeGitHub();
    const flaky = jest.fn(async (url: string): Promise<Reply> => (url.endsWith("format.ts") ? failed : fetcher(url)));
    const found = await new SourceReader(SHA, flaky as never).search("return", ["apps/mobile"]);
    expect(found).toContain("1 of 2 files couldn't be read from GitHub");
    expect(found).toContain("apps/mobile/src/lib/format.ts");
    const down = jest.fn(async (url: string): Promise<Reply> => (url.startsWith("https://raw.") ? failed : fetcher(url)));
    await expect(new SourceReader(SHA, down as never).search("return", ["apps/mobile"])).rejects.toThrow(/None of the 2 files/);
  });
});

describe("costOf", () => {
  it("knows a price only when the answer gave one", () => {
    expect(costOf({ cost: 0.02 })).toBe(0.02);
    expect(costOf({ pricing: { total_usd_str: "0" } })).toBe(0);
    expect(costOf({ pricing: { total_usd_str: "0.0125" } })).toBe(0.0125);
    expect(costOf({ pricing: { total_usd_str: null } })).toBeNull();
    expect(costOf({ pricing: { total_usd_str: "" } })).toBeNull();
    expect(costOf({ pricing: { total_usd_str: "n/a" } })).toBeNull();
    expect(costOf({ prompt_tokens: 5 })).toBeNull();
    expect(costOf(undefined)).toBeNull();
  });
});

describe("triage text", () => {
  it("names the exact commit, or says it reads main", () => {
    expect(triagePrompt(BUILD, "")).toContain(`exactly commit ${SHA}`);
    expect(triagePrompt({ ...BUILD, commit: null }, "")).toContain("you read the latest main");
    const unpublished = triagePrompt({ ...BUILD, unpublished: true }, "");
    expect(unpublished).toContain(`This build's commit (${SHA}) isn't on GitHub`);
    expect(triagePrompt(BUILD, "2026-11-12T10:00:00.000Z Chat list took 900 ms")).toContain("Chat list took 900 ms");
  });

  it("labels steps and builds a new-issue link with a shortened body", () => {
    expect(stepLabel("read_file", { path: "apps/mobile/src/a/b.ts", start_line: 10 })).toEqual({ label: "Read b.ts", detail: "apps/mobile/src/a/b.ts, from line 10" });
    const url = new URL(newIssueUrl({ title: "T", body: "x".repeat(50) }, 10));
    expect(url.pathname).toBe("/phaseoteam/Phaseo/issues/new");
    expect(url.searchParams.get("title")).toBe("T");
    expect(url.searchParams.get("body")).toMatch(/^x{10}\n\n…\(shortened/);
  });
});
