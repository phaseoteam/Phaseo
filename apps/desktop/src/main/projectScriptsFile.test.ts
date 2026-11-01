import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readProjectScriptsFile } from "./projectScriptsFile";

describe("reading the project file", () => {
	it("reports a missing, invalid or readable file at the checkout root", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-project-file-"));
		try {
			expect(await readProjectScriptsFile(directory)).toEqual({ status: "missing", scripts: [] });
			expect(await readProjectScriptsFile(path.join(directory, "gone"))).toEqual({ status: "missing", scripts: [] });
			writeFileSync(path.join(directory, "t3.json"), "\uFEFF" + JSON.stringify({ scripts: [{ name: "Dev", command: "pnpm dev" }] }));
			expect(await readProjectScriptsFile(directory)).toEqual({ status: "ok", scripts: [{ name: "Dev", command: "pnpm dev" }] });
			writeFileSync(path.join(directory, "t3.json"), "{ \"scripts\": [ }");
			expect(await readProjectScriptsFile(directory)).toEqual({ status: "invalid", scripts: [] });
			rmSync(path.join(directory, "t3.json")); mkdirSync(path.join(directory, "t3.json"));
			expect((await readProjectScriptsFile(directory)).status).toBe("invalid");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
});
