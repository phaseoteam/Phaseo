import { createParser, createStreamingParser } from "@openuidev/react-lang";
import { openuiLibrary, isValidOpenUIResult } from "./openuiLibrary";
import {
  OPENUI_BROKEN_FIXTURE,
  OPENUI_EDGE_FIXTURE,
  OPENUI_FIXTURE,
} from "./openuiFixtures";

describe("curated OpenUI library", () => {
  it.each([OPENUI_FIXTURE, OPENUI_EDGE_FIXTURE])(
    "parses a complete fixture with no unresolved references",
    (source) => {
      const result = createParser(openuiLibrary.toJSONSchema()).parse(source);
      expect(result.root?.typeName).toBe("Answer");
      expect(result.meta.errors).toEqual([]);
      expect(result.meta.unresolved).toEqual([]);
      expect(isValidOpenUIResult(result)).toBe(true);
    },
  );
  it("accepts partial tokens and resolves forward references at stream completion", () => {
    const parser = createStreamingParser(openuiLibrary.toJSONSchema());
    for (let offset = 0; offset < OPENUI_FIXTURE.length; offset += 13) {
      expect(() =>
        parser.push(OPENUI_FIXTURE.slice(offset, offset + 13)),
      ).not.toThrow();
    }
    expect(parser.getResult().root?.typeName).toBe("Answer");
    expect(parser.getResult().meta.unresolved).toEqual([]);
    expect(parser.getResult().meta.errors).toEqual([]);
  });
  it("reports unsupported components rather than registering model-provided code", () => {
    const result = createParser(openuiLibrary.toJSONSchema()).parse(
      OPENUI_BROKEN_FIXTURE,
    );
    expect(
      result.meta.errors.some((error) => error.code === "unknown-component"),
    ).toBe(true);
  });
  it("rejects invalid form field names and oversized tables even if the parser materializes them", () => {
    const invalidForm =
      'root = Answer("Test", [FollowUp("Question", "bad field", "Hint", "Send")])';
    expect(
      isValidOpenUIResult(
        createParser(openuiLibrary.toJSONSchema()).parse(invalidForm),
      ),
    ).toBe(false);
    const columns = JSON.stringify(Array.from({ length: 9 }, () => "Column"));
    const invalidTable = `root = Answer("Test", [DataTable("Table", ${columns}, [])])`;
    expect(
      isValidOpenUIResult(
        createParser(openuiLibrary.toJSONSchema()).parse(invalidTable),
      ),
    ).toBe(false);
  });
});
