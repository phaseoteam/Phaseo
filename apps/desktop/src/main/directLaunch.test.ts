import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { directLaunch } from "./nativeProcess";

describe.runIf(process.platform === "win32" && ["x64", "arm64"].includes(process.arch))("directLaunch", () => {
	it("starts npm's bundled codex.exe directly so Windows opens no console window", () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-codex-launch-"));
		try {
			const target = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
			const entry = path.join(root, "node_modules", "@openai", "codex", "bin", "codex.js");
			const binary = path.join(root, "node_modules", "@openai", "codex", "node_modules", "@openai", `codex-win32-${process.arch}`, "vendor", target, "bin", "codex.exe");
			mkdirSync(path.dirname(entry), { recursive: true }); writeFileSync(entry, "");
			const launcher = { executable: process.execPath, prefix: [entry] };
			expect(directLaunch(launcher)).toBe(launcher);
			mkdirSync(path.dirname(binary), { recursive: true }); writeFileSync(binary, "");
			expect(directLaunch(launcher)).toEqual({ executable: binary, prefix: [], environment: { CODEX_MANAGED_BY_NPM: "1" } });
			const other = { executable: process.execPath, prefix: [path.join(root, "pi", "cli.js")] };
			expect(directLaunch(other)).toBe(other);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
