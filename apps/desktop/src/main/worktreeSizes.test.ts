import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { measureWorktree } from "./worktreeSizes";
import { sizeLabel } from "../renderer/settings/WorktreeCleanupSettings";

describe("worktree sizes", () => {
	it("counts a checkout's bytes, with dependencies and build output on their own", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-worktree-size-"));
		try {
			mkdirSync(path.join(directory, "node_modules", "pkg", "dist"), { recursive: true });
			mkdirSync(path.join(directory, "apps", "web", ".next"), { recursive: true });
			writeFileSync(path.join(directory, "README.md"), "x".repeat(100));
			writeFileSync(path.join(directory, "node_modules", "pkg", "dist", "index.js"), "x".repeat(1000));
			writeFileSync(path.join(directory, "apps", "web", ".next", "page.js"), "x".repeat(300));
			expect(await measureWorktree(directory)).toEqual({ bytes: 1400, dependencies: 1000, build: 300, partial: false });
			expect((await measureWorktree(directory, { entries: 1, ms: 20_000 })).partial).toBe(true);
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});

	it("labels a size with its parts, and a cut-short count as a minimum", () => {
		expect(sizeLabel({ bytes: 3 * 1024 ** 3, dependencies: 2 * 1024 **3, build: 0, partial: false })).toBe("3.00 GB · dependencies 2.00 GB");
		expect(sizeLabel({ bytes: 500, dependencies: 0, build: 200, partial: true })).toBe("at least 500 B · build 200 B");
	});
});
