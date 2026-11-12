import { describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { candidatePorts, parseLsof, parseNetstat, parseTasklist, probeAddress } from "./browserLocalServers";

describe("local server discovery", () => {
	it("reads loopback listeners from netstat and ignores remote and closed sockets", () => {
		const output = [
			"Active Connections", "", "  Proto  Local Address          Foreign Address        State           PID",
			"  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1200",
			"  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       4400",
			"  TCP    192.168.1.5:3000       0.0.0.0:0              LISTENING       4500",
			"  TCP    127.0.0.1:5173         127.0.0.1:61000        ESTABLISHED     4400",
			"  TCP    [::1]:3000             [::]:0                 LISTENING       4600",
			"  TCP    [::]:8080              [::]:0                 LISTENING       4700",
		].join("\r\n");
		expect(parseNetstat(output)).toEqual([{ host: "0.0.0.0", port: 135, pid: 1200 }, { host: "127.0.0.1", port: 5173, pid: 4400 }, { host: "::1", port: 3000, pid: 4600 }, { host: "::", port: 8080, pid: 4700 }]);
	});
	it("names processes from tasklist", () => {
		expect(parseTasklist('"node.exe","4400","Console","1","120,000 K"\r\n"System","4","Services","0","100 K"')).toEqual(new Map([[4400, "node"], [4, "System"]]));
	});
	it("reads loopback listeners and their command from lsof", () => {
		expect(parseLsof("p100\ncnode\nn127.0.0.1:5173\nn*:3000\np200\ncpostgres\nn10.0.0.2:5432\nn[::1]:6006")).toEqual([{ host: "127.0.0.1", port: 5173, pid: 100, process: "node" }, { host: "*", port: 3000, pid: 100, process: "node" }, { host: "::1", port: 6006, pid: 200, process: "postgres" }]);
	});
	it("keeps one entry per web port, without system services or ephemeral ports", () => {
		expect(candidatePorts([{ host: "::1", port: 3000 }, { host: "127.0.0.1", port: 3000 }, { host: "0.0.0.0", port: 135 }, { host: "0.0.0.0", port: 49664 }, { host: "127.0.0.1", port: 1420 }]).map(item => item.port)).toEqual([1420, 3000]);
	});
});

describe("action preview readiness", () => {
	it("answers true once a local address responds at all, and false when nothing listens", async () => {
		const server = http.createServer((_request, response) => { response.statusCode = 404; response.end("not here"); });
		await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
		const port = (server.address() as AddressInfo).port;
		try {
			expect(await probeAddress(`http://127.0.0.1:${port}/`)).toBe(true);
		} finally { await new Promise(resolve => server.close(resolve)); }
		expect(await probeAddress(`http://127.0.0.1:${port}/`)).toBe(false);
	});
});
