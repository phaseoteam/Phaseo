import { answer, hugeAnswer, random } from "@/perf/corpus";
import { blockStarts, CHUNK_TARGET, liveBlocks, markdownChunks, streamingBoundaries, TABLE_PIECE_ROWS } from "./markdownChunks";

const longAnswer = (bytes: number, seed = 1) => {
  const r = random(seed);
  let text = "";
  while (text.length < bytes) text += `${answer(r)}\n\n`;
  return text.trim();
};

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

describe("blocks", () => {
  test("end at blank lines, but not inside code fences or before indented continuations", () => {
    const text = "One\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n- item\n\n  more of the item\n\nLast";
    const starts = blockStarts(text);
    expect(starts.map((start) => text.slice(start, start + 6))).toEqual(["```ts\n", "- item", "Last"]);
  });

  test("a block counts as started only once its first character has arrived", () => {
    expect(blockStarts("One\n\n")).toEqual([]);
    expect(blockStarts("One\n\nT")).toEqual([5]);
    expect(blockStarts("One\n\n  ")).toEqual([]);
  });
});

describe("chunks", () => {
  test("an ordinary answer is one chunk", () => {
    const text = longAnswer(3_000);
    expect(markdownChunks(text)).toEqual([text]);
  });

  test("a long answer is cut between blocks into chunks of about the target size, losing nothing", () => {
    const text = longAnswer(60_000);
    const chunks = markdownChunks(text);
    expect(chunks.length).toBeGreaterThan(6);
    expect(squash(chunks.join("\n\n"))).toBe(squash(text));
    for (const chunk of chunks.slice(0, -1)) expect(chunk.length).toBeGreaterThanOrEqual(CHUNK_TARGET);
    // No chunk starts inside a code block.
    for (const chunk of chunks) expect((chunk.match(/^```/gm) ?? []).length % 2).toBe(0);
  });

  test("while streaming, boundaries never move as text arrives, and match the finished answer's", () => {
    const text = longAnswer(40_000, 7);
    const final = streamingBoundaries(text);
    let seen: number[] = [];
    for (let length = 0; length <= text.length; length += 997) {
      const prefix = text.slice(0, length);
      const now = [...seen, ...streamingBoundaries(prefix, seen.at(-1) ?? 0)];
      expect(now.slice(0, seen.length)).toEqual(seen);
      expect(final.slice(0, now.length)).toEqual(now);
      seen = now;
    }
    const edges = [0, ...final, text.length];
    expect(markdownChunks(text)).toEqual(edges.slice(0, -1).map((start, index) => text.slice(start, edges[index + 1]).replace(/\s+$/, "")));
  });

  test("a 400 KB answer with a 900-row table is cut up quickly, with the table's header on every piece", () => {
    const text = hugeAnswer(random(3));
    expect(text.length).toBeGreaterThan(400 * 1024);
    const started = performance.now();
    const chunks = markdownChunks(text);
    expect(performance.now() - started).toBeLessThan(500);
    const tables = chunks.filter((chunk) => chunk.includes("| Option | Latency | Memory | Notes |"));
    expect(tables.length).toBeGreaterThanOrEqual(Math.floor(900 / TABLE_PIECE_ROWS));
    for (const table of tables) expect(table).toContain("| --- | ---: | ---: | --- |");
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThan(CHUNK_TARGET * 4);
    expect(chunks.join("").length).toBeGreaterThan(text.length * 0.98);
  });

  test("a streaming tail splits into finished blocks and the one still arriving", () => {
    expect(liveBlocks("Para one.\n\nPara two.\n\nPara thr")).toEqual({ done: ["Para one.", "Para two."], live: "Para thr" });
    expect(liveBlocks("```py\nx = 1\n\ny")).toEqual({ done: [], live: "```py\nx = 1\n\ny" });
  });
});
