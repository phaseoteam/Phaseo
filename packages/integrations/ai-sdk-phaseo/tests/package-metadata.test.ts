import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("published package lifecycle", () => {
  it("does not run repository-only hooks when installed", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    for (const event of ["preinstall", "install", "postinstall"]) {
      expect(pkg.scripts[event]).toBeUndefined();
    }
  });
});
