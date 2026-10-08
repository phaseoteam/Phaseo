import { realpathSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveHarnessMaintenance } from "./harnessMaintenance";
import { runHarnessUpdate } from "./runHarnessUpdate";

describe("harness maintenance ownership", () => {
	it("targets a confirmed npm prefix with literal package arguments", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-maintenance-"));
		const prefix = path.join(directory, "owned & prefix"), bin = process.platform === "win32" ? prefix : path.join(prefix, "bin");
		const root = path.join(prefix, process.platform === "win32" ? "" : "lib", "node_modules", "@openai", "codex");
		const target = path.join(root, "bin", "codex.js"), npmRoot = path.join(prefix, process.platform === "win32" ? "" : "lib", "node_modules", "npm");
		mkdirSync(path.dirname(target), { recursive: true }); mkdirSync(path.join(npmRoot, "bin"), { recursive: true }); mkdirSync(bin, { recursive: true });
		writeFileSync(target, "owned"); writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "@openai/codex", bin: { codex: "bin/codex.js" } }));
		writeFileSync(path.join(npmRoot, "package.json"), JSON.stringify({ name: "npm" })); writeFileSync(path.join(npmRoot, "bin", "npm-cli.js"), "owned");
		try {
			const command = { executable: process.execPath, prefix: [target] }, lookup = { home: directory, searchPath: bin };
			const value = await resolveHarnessMaintenance("codex", command, lookup);
			expect(value.method).toBe("npm"); expect(value.action?.args.slice(1)).toEqual(["install", "--global", "--prefix", realpathSync.native(prefix), "--allow-scripts=@openai/codex", "@openai/codex@latest"]);
			const alias = path.join(directory, "prefix-alias"); symlinkSync(prefix, alias, process.platform === "win32" ? "junction" : "dir");
			expect(await resolveHarnessMaintenance("codex", command, { ...lookup, searchPath: process.platform === "win32" ? alias : path.join(alias, "bin") })).toEqual(value);
			expect(await resolveHarnessMaintenance("codex", command, { ...lookup, searchPath: path.join(prefix, "node_modules", ".bin") })).toEqual({ method: "manual" });
			writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "foreign-package", bin: { codex: "bin/codex.js" } }));
			expect(await resolveHarnessMaintenance("codex", command, lookup)).toEqual({ method: "manual" });
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("does not assign a native updater to a custom Claude binary", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-maintenance-")), launcher = path.join(directory, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
		mkdirSync(path.dirname(launcher), { recursive: true }); writeFileSync(launcher, "owned");
		try {
			expect(await resolveHarnessMaintenance("claude", { executable: launcher, prefix: [] }, { home: directory, searchPath: path.dirname(launcher) })).toEqual({ method: "native", action: { executable: realpathSync.native(launcher), args: ["update"] } });
			const alias = path.join(directory, "home-alias"); symlinkSync(directory, alias, process.platform === "win32" ? "junction" : "dir");
			expect(await resolveHarnessMaintenance("claude", { executable: path.join(alias, ".local/bin", path.basename(launcher)), prefix: [] }, { home: alias, searchPath: "" })).toEqual({ method: "native", action: { executable: realpathSync.native(launcher), args: ["update"] } });
			const custom = path.join(directory, "custom"); writeFileSync(custom, "owned");
			expect(await resolveHarnessMaintenance("claude", { executable: custom, prefix: [] }, { home: directory, searchPath: directory })).toEqual({ method: "manual" });
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("runs only literal arguments and returns failure without private process output", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-maintenance-")), fixture = path.join(directory, "owned.cjs");
		writeFileSync(fixture, "if(process.argv[2] !== 'literal $(value) & text') process.exit(1); console.log('owned');");
		try {
			await expect(runHarnessUpdate({ executable: process.execPath, args: [fixture, "literal $(value) & text"] }, directory, new AbortController().signal)).resolves.toBeUndefined();
			writeFileSync(fixture, "console.error('private stderr');process.exit(1);");
			await expect(runHarnessUpdate({ executable: process.execPath, args: [fixture] }, directory, new AbortController().signal)).rejects.toThrow("Harness update failed.");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("cancels an owned updater and rejects excessive output", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-maintenance-")), fixture = path.join(directory, "owned.cjs");
		try {
			writeFileSync(fixture, "setInterval(()=>{},1000);"); const controller = new AbortController();
			const update = runHarnessUpdate({ executable: process.execPath, args: [fixture] }, directory, controller.signal);
			const assertion = expect(update).rejects.toThrow("cancelled"); controller.abort(); await assertion;
			writeFileSync(fixture, "process.stdout.write('a'.repeat(1100000));setInterval(()=>{},1000);");
			await expect(runHarnessUpdate({ executable: process.execPath, args: [fixture] }, directory, new AbortController().signal)).rejects.toThrow("output limit");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("terminates an updater's owned descendant on cancellation", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-maintenance-tree-")), fixture = path.join(directory, "owned.cjs"), pidFile = path.join(directory, "descendant.txt"), controller = new AbortController();
		writeFileSync(fixture, `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`)}],{stdio:'ignore'});setInterval(()=>{},1000);`);
		try {
			const operation = runHarnessUpdate({ executable: process.execPath, args: [fixture] }, directory, controller.signal), assertion = expect(operation).rejects.toThrow("cancelled");
			await vi.waitFor(() => expect(existsSync(pidFile)).toBe(true)); const pid = Number(readFileSync(pidFile, "utf8"));
			controller.abort(); await assertion;
			await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
		} finally { controller.abort(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); }
	}, 10_000);
});
