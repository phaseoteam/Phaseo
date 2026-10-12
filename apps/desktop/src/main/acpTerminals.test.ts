import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { AcpTerminals } from "./acpTerminals";

describe("ACP command terminals", () => {
	it("runs approved argument arrays, preserves UTF-8 boundaries and reports exit status", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-acp-terminal-"));
		const onApproval = vi.fn(async () => "accept" as const); const onActivity = vi.fn();
		const terminals = new AcpTerminals(root, { onDelta: vi.fn(), onSession: vi.fn(), onApproval, onActivity });
		try {
			const { terminalId } = await terminals.create({ sessionId: "session", command: process.execPath, args: ["-e", "process.stdout.write('prefix🌍');process.exitCode=7"], cwd: root, outputByteLimit: 5 });
			expect(await terminals.wait(terminalId)).toMatchObject({ exitCode: 7 });
			expect(terminals.output(terminalId)).toMatchObject({ output: "x🌍", truncated: true, exitStatus: { exitCode: 7 } });
			expect(onApproval).toHaveBeenCalledOnce(); expect(onActivity.mock.lastCall?.[0]).toMatchObject({ text: "x🌍", status: "failed" });
			await terminals.release(terminalId);
			expect(() => terminals.output(terminalId)).toThrow("unavailable");
		} finally { await terminals.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("requires approval, rejects outside directories and enforces output limits", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-acp-terminal-")); const onApproval = vi.fn(async () => "decline" as const);
		const terminals = new AcpTerminals(root, { onDelta: vi.fn(), onSession: vi.fn(), onApproval });
		const request = { sessionId: "session", command: process.execPath, args: ["-e", "process.exit(0)"] };
		try {
			await expect(terminals.create({ ...request, cwd: path.dirname(root) })).rejects.toThrow("outside");
			await expect(terminals.create({ ...request, outputByteLimit: 2 * 1024 * 1024 })).rejects.toThrow("output limits");
			expect(onApproval).not.toHaveBeenCalled();
			await expect(terminals.create(request)).rejects.toThrow("declined");
			await terminals.close(); await expect(terminals.create(request)).rejects.toThrow("Task stopped");
		} finally { await terminals.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("kills outstanding commands and settles waiters on shutdown", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-acp-terminal-"));
		const terminals = new AcpTerminals(root, { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "accept" });
		try {
			const { terminalId } = await terminals.create({ sessionId: "session", command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] });
			const waiter = terminals.wait(terminalId); await terminals.close();
			const status = await waiter; expect(status.exitCode !== 0 || Boolean(status.signal)).toBe(true);
			expect(() => terminals.output(terminalId)).toThrow("unavailable");
		} finally { await terminals.close(); rmSync(root, { recursive: true, force: true }); }
	}, 15000);
});
