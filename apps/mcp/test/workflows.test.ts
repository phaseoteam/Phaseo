import { describe, expect, it } from "vitest";
import { parseShortlists, integrationExample } from "../ui/workflows";
import type { Model } from "../ui/model";

describe("saved shortlist boundary", () => {
  it("reads valid model IDs and rejects oversized or corrupt saved data", () => {
    expect(parseShortlists(null)).toEqual([]);
    expect(
      parseShortlists('[{"name":"Coding","ids":["lab/a","lab/a"]}]'),
    ).toEqual([{ name: "Coding", ids: ["lab/a"] }]);
    for (const raw of [
      "broken",
      "{}",
      '[{"name":"","ids":["lab/a"]}]',
      '[{"name":"Too many","ids":["a","b","c","d"]}]',
      JSON.stringify(
        Array.from({ length: 21 }, () => ({ name: "n", ids: ["id"] })),
      ),
    ])
      expect(() => parseShortlists(raw)).toThrow();
  });
  it("escapes model identifiers in integration examples without including credentials", () => {
    const model = { id: 'lab/a";bad', name: "Model" } as Model;
    expect(integrationExample(model, "TypeScript")).toContain(
      'model: "lab/a\\";bad"',
    );
    expect(integrationExample(model, "Python")).toContain(
      'model="lab/a\\";bad"',
    );
    const shellModel = { id: "lab/a'b" } as Model;
    expect(integrationExample(shellModel, "curl")).toContain("'\\''");
    expect(integrationExample(model, "TypeScript")).toContain(
      "process.env.PHASEO_API_KEY",
    );
  });
});
