import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { harnessVersion } from "./harnessVersion";

async function probe(script: string) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-harness-version-"));
	const filename = path.join(directory, "owned fixture & literal.cjs");
	writeFileSync(filename, script);
	try { return await harnessVersion({ executable: process.execPath, prefix: [filename] }, directory); }
	finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("native harness versions", () => {
	it.each(["codex-cli 0.120.0", "2.1.80 (Claude Code)", "v0.60.2", "grok 1.2.3-nightly.4+build.5"])("reads a bounded version from a real process: %s", async output => {
		expect(await probe(`if (process.argv[2] !== '--version') process.exit(1); console.log(${JSON.stringify(output)});`)).toBe(output.match(/\d+\.\d+\.\d+[^\s)]*/)?.[0]);
	});
	it.each(["signed in as private@example.com", "1.2.3\nprivate content", "\u001b[31m1.2.3\u001b[0m", "1.2.3 $(literal)"])("rejects diagnostic or terminal content: %s", async output => {
		await expect(probe(`console.log(${JSON.stringify(output)});`)).rejects.toThrow("recognized version");
	});
	it("does not expose failed command stderr", async () => {
		await expect(probe("console.error('private content'); process.exit(1);")).rejects.toThrow("version check failed");
	});
	it("clears inherited Node bootstrap settings before launching the probe", async () => {
		const previousOptions = process.env.NODE_OPTIONS, previousPath = process.env.NODE_PATH;
		process.env.NODE_OPTIONS = "--require=phaseo-owned-missing-bootstrap";
		process.env.NODE_PATH = "phaseo-owned-private-path";
		try {
			expect(await probe("if (process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.ELECTRON_RUN_AS_NODE !== '1') process.exit(1); console.log('1.2.3');")).toBe("1.2.3");
		} finally {
			if (previousOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previousOptions;
			if (previousPath === undefined) delete process.env.NODE_PATH; else process.env.NODE_PATH = previousPath;
		}
	});
	it("bounds output and stops a hanging version command", async () => {
		await expect(probe("console.log('a'.repeat(20000));")).rejects.toThrow("version check failed");
		await expect(probe("setInterval(() => {}, 1000);")).rejects.toThrow("version check failed");
	}, 10_000);
	it("rejects missing executables rather than confirming their names", async () => {
		await expect(harnessVersion({ executable: path.join(tmpdir(), "phaseo-missing-harness-9b70ea"), prefix: [] }, tmpdir())).rejects.toThrow("version check failed");
	});
});
