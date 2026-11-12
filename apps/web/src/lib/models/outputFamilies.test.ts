import { describe, it, expect } from "vitest";
import { modelGroupModalities } from "./modelGroupModalities";
import { selectedOutputFamily, toggleOutputFamily } from "./outputFamilies";

describe("Decisions family", () => {
  it("discovers extraction models under Decisions without granting classification", () => {
    const groups = modelGroupModalities(new Set(), ["extraction.extract"]);
    expect([...groups]).toEqual(["extraction", "decisions"]);
    expect(groups.has("decision")).toBe(false);
  });
  it("opens, narrows and closes Decisions while preserving unrelated filters", () => {
    expect(toggleOutputFamily(["text"], "decisions")).toEqual(["text", "decisions"]);
    expect(toggleOutputFamily(["text", "decisions"], "extraction")).toEqual(["text", "extraction"]);
    expect(selectedOutputFamily(["text", "extraction"])).toBe("decisions");
    expect(toggleOutputFamily(["text", "extraction"], "extraction")).toEqual(["text", "decisions"]);
    expect(toggleOutputFamily(["text", "extraction"], "decisions")).toEqual(["text"]);
  });
  it("preserves Audio behavior", () => {
    expect(toggleOutputFamily(["text", "audio"], "audio_stt")).toEqual(["text", "audio_stt"]);
    expect(selectedOutputFamily(["audio_stt"])).toBe("audio");
  });
});
