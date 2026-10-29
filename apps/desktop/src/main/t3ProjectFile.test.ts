import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readT3ProjectFile } from "./t3ProjectFile";

describe("reading t3.json", () => {
	it("reports a missing, invalid or readable file at the checkout root", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-t3json-"));
		try {
			expect(await readT3ProjectFile(directory)).toEqual({ status: "missing", scripts: [] });
			expect(await readT3ProjectFile(path.join(directory, "gone"))).toEqual({ status: "missing", scripts: [] });
			writeFileSync(path.join(directory, "t3.json"), "\uFEFF" + JSON.stringify({ scripts: [{ name: "Dev", command: "pnpm dev" }] }));
			expect(await readT3ProjectFile(directory)).toEqual({ status: "ok", scripts: [{ name: "Dev", command: "pnpm dev" }] });
			writeFileSync(path.join(directory, "t3.json"), "{ \"scripts\": [ }");
			expect(await readT3ProjectFile(directory)).toEqual({ status: "invalid", scripts: [] });
			rmSync(path.join(directory, "t3.json")); mkdirSync(path.join(directory, "t3.json"));
			expect((await readT3ProjectFile(directory)).status).toBe("invalid");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
});
