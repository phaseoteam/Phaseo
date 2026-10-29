import { describe, expect, it } from "vitest";
import { parsePosixProcessTable, parseWindowsProcessTable, shellIsBusy } from "./terminalProcesses";

describe("terminal process checks", () => {
	it("reads ps and Windows process tables", () => {
		expect(parsePosixProcessTable("  1     0 launchd\n 200   1 -zsh\n 201 200 node server.js\nbad line\n")).toEqual([{ pid: 1, ppid: 0, name: "launchd" }, { pid: 200, ppid: 1, name: "-zsh" }, { pid: 201, ppid: 200, name: "node server.js" }]);
		expect(parseWindowsProcessTable("4|0|System\r\n900|12|powershell.exe\r\n\r\nx|1|bad\r\n")).toEqual([{ pid: 4, ppid: 0, name: "System" }, { pid: 900, ppid: 12, name: "powershell.exe" }]);
	});

	it("treats a shell with a child command as busy", () => {
		const rows = [{ pid: 900, ppid: 12, name: "powershell.exe" }, { pid: 901, ppid: 900, name: "node.exe" }];
		expect(shellIsBusy(rows, 900)).toBe(true);
		expect(shellIsBusy(rows.slice(0, 1), 900)).toBe(false);
	});

	it("ignores console hosts and a childless copy of the shell, as prompt themes fork one", () => {
		expect(shellIsBusy([{ pid: 900, ppid: 12, name: "powershell.exe" }, { pid: 901, ppid: 900, name: "conhost.exe" }], 900)).toBe(false);
		expect(shellIsBusy([{ pid: 200, ppid: 1, name: "-zsh" }, { pid: 201, ppid: 200, name: "zsh" }], 200)).toBe(false);
		expect(shellIsBusy([{ pid: 200, ppid: 1, name: "zsh" }, { pid: 201, ppid: 200, name: "zsh" }, { pid: 202, ppid: 201, name: "sleep" }], 200)).toBe(true);
	});
});
