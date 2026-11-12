import { diagnosticsText, slowOperationLine } from "./diagnosticsReport";

describe("diagnostics text", () => {
  const at = Date.UTC(2026, 9, 19, 12, 4, 31);

  test("one line per slow operation, with its details", () => {
    expect(slowOperationLine({ name: "Chat opened", ms: 182.4, at, detail: "40 messages" })).toBe("12:04:31  Chat opened  182 ms  (40 messages)");
    expect(slowOperationLine({ name: "Stream flush", ms: 51, at })).toBe("12:04:31  Stream flush  51 ms");
  });

  test("sections, then the slow operations", () => {
    const text = diagnosticsText([{ title: "App", rows: [["Version", "0.1.0"], ["Commit", "abc"]] }], [{ name: "Chat page loaded", ms: 75, at, detail: "older, 40 messages" }], at, 50);
    expect(text).toBe([
      "Phaseo diagnostics, 2026-10-19T12:04:31.000Z",
      "",
      "App",
      "  Version: 0.1.0",
      "  Commit: abc",
      "",
      "Slow operations (50 ms or more, newest first, times in UTC)",
      "  12:04:31  Chat page loaded  75 ms  (older, 40 messages)",
      "",
    ].join("\n"));
    expect(diagnosticsText([], [], at, 50)).toContain("  None recorded");
  });
});
