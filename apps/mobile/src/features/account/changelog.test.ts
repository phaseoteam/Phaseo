import { changelogDate, inlineSegments, mergeChangelogs, modelIdFromUrl, parseChangelog, previousMonth, sentenceCase } from "./changelog";

const CURRENT = `> ## Documentation Index
> Fetch the complete documentation index at: https://phaseo.app/docs/llms.txt

# October

> October 2026 product updates and model releases across Phaseo.

## October 9, 2026

<p style={{ fontSize: "1rem", fontWeight: 600 }}>Product</p>

* Chat adds an opt-in **Interactive answers** experiment beside \`temporary chat\`.

***

## October 7, 2026

<p style={{ fontSize: "1rem" }}>New Models</p>

<img src="https://mintcdn.com/x.png" alt="Claude Haiku 5.5 model release artwork" />

* [Anthropic: Claude Haiku 5.5](https://phaseo.app/models/anthropic/claude-haiku-5.5)
* [Google: Nano Banana 2.1](https://phaseo.app/models/google/gemini-nano-banana-2.1) added with Vertex routes.

***


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.
`;

const ARCHIVE = `# September

<Update label="September 30, 2026" tags={["Model Releases"]}>
  ### Model Releases

  * [Voyage: Rerank 3](https://phaseo.app/models/voyage/rerank-3)
</Update>

<Update label="October 7, 2026" tags={["Model Releases"]}>
  * Duplicate of a day already on the current page.
</Update>

<Update label="Not a date">
  * Ignored.
</Update>
`;

describe("changelog", () => {
  test("reads the current month's plain sections", () => {
    const entries = parseChangelog(CURRENT);
    expect(entries.map((entry) => entry.date)).toEqual(["October 9, 2026", "October 7, 2026"]);
    expect(entries[0]!.groups).toEqual([{ title: "Product", items: [[{ text: "Chat adds an opt-in Interactive answers experiment beside temporary chat." }]] }]);
    expect(entries[1]!.groups[0]!.title).toBe("New models");
    expect(entries[1]!.groups[0]!.items).toHaveLength(2);
    expect(entries[1]!.groups[0]!.items[1]).toEqual([{ text: "Google: Nano Banana 2.1", url: "https://phaseo.app/models/google/gemini-nano-banana-2.1" }, { text: " added with Vertex routes." }]);
  });

  test("reads archived months' Update blocks and merges pages newest first, each day once", () => {
    const merged = mergeChangelogs([parseChangelog(CURRENT), parseChangelog(ARCHIVE)]);
    expect(merged.map((entry) => entry.date)).toEqual(["October 9, 2026", "October 7, 2026", "September 30, 2026"]);
    expect(merged[2]!.groups[0]).toEqual({ title: "Model releases", items: [[{ text: "Voyage: Rerank 3", url: "https://phaseo.app/models/voyage/rerank-3" }]] });
  });

  test("dates, months, titles and links", () => {
    expect(changelogDate("October 9, 2026")).toBe(Date.UTC(2026, 9, 9));
    expect(changelogDate("Octember 9, 2026")).toBeNull();
    expect(previousMonth(Date.UTC(2026, 9, 1))).toBe("2026-09");
    expect(previousMonth(Date.UTC(2027, 0, 5))).toBe("2026-12");
    expect(sentenceCase("New Models API")).toBe("New models API");
    expect(inlineSegments("Use `phaseo/free` and [docs](https://phaseo.app/docs)")).toEqual([{ text: "Use phaseo/free and " }, { text: "docs", url: "https://phaseo.app/docs" }]);
    expect(modelIdFromUrl("https://phaseo.app/models/liquid-ai/d1:free", "https://phaseo.app")).toBe("liquid-ai/d1:free");
    expect(modelIdFromUrl("https://example.com/models/a/b", "https://phaseo.app")).toBeNull();
  });
});
