import { describe, expect, it } from "vitest";
import { validateCommand } from "../src/main/commands";

describe("validateCommand", () => {
  it("allows safe commands", () => {
    expect(() => validateCommand("pnpm lint")).not.toThrow();
    expect(() => validateCommand("git status")).not.toThrow();
  });

  it("blocks destructive commands", () => {
    expect(() => validateCommand("rm -rf .")).toThrow(/blocked/i);
    expect(() => validateCommand("git reset --hard HEAD~1")).toThrow(/blocked/i);
    expect(() => validateCommand("shutdown /s /t 0")).toThrow(/blocked/i);
  });
});
