import { describe, expect, it } from "vitest";
import { parseGitStatusPorcelain } from "../src/main/git";

describe("parseGitStatusPorcelain", () => {
  it("parses modified, renamed, and untracked entries", () => {
    const output = [
      " M src/main/index.ts",
      "R  src/old.ts -> src/new.ts",
      "?? src/new-file.ts"
    ].join("\n");

    const parsed = parseGitStatusPorcelain(output);

    expect(parsed).toHaveLength(3);
    expect(parsed.find((entry) => entry.path === "src/main/index.ts")?.workTreeStatus).toBe("M");
    expect(parsed.find((entry) => entry.path === "src/new.ts")?.originalPath).toBe("src/old.ts");
    expect(parsed.find((entry) => entry.path === "src/new-file.ts")?.indexStatus).toBe("?");
  });
});
