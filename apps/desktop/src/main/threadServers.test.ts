import { describe, expect, it } from "vitest";
import { descendants, threadServersFrom } from "./threadServers";

const row = (pid: number, ppid: number, name = "node.exe") => ({ pid, ppid, name });
// Electron (1) runs two chats' terminals (10, 20); chat A's shell runs pnpm (11), which runs vite (12).
const table = [row(1, 0, "phaseo.exe"), row(10, 1, "pwsh.exe"), row(11, 10), row(12, 11), row(13, 12, "esbuild.exe"), row(20, 1, "pwsh.exe"), row(21, 20), row(30, 1, "postgres.exe")];

describe("a chat's servers", () => {
	it("lists ports whose process descends from the chat's terminals, and nothing else's", () => {
		const listeners = [{ host: "127.0.0.1", port: 5173, pid: 12, process: "node" }, { host: "::1", port: 3000, pid: 21, process: "node" }, { host: "127.0.0.1", port: 5432, pid: 30, process: "postgres" }, { host: "127.0.0.1", port: 445, pid: 12 }];
		expect(threadServersFrom([{ pid: 10, label: "Dev server" }], table, listeners)).toEqual([{ port: 5173, url: "http://localhost:5173/", pid: 12, process: "node", startedBy: "Dev server" }]);
		expect(threadServersFrom([{ pid: 20, label: "pnpm start" }], table, listeners).map(server => server.port)).toEqual([3000]);
		expect(threadServersFrom([], table, listeners)).toEqual([]);
	});

	it("stops at a parent loop rather than hanging", () => {
		expect(threadServersFrom([{ pid: 99, label: "x" }], [row(5, 6), row(6, 5)], [{ host: "127.0.0.1", port: 8080, pid: 5 }])).toEqual([]);
	});

	it("stops a server's children before the server", () => {
		expect(descendants(table, 11)).toEqual([13, 12]);
		expect(descendants(table, 13)).toEqual([]);
	});
});
