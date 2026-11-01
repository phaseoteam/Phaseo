import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { bindHosts, detectAddresses, ensureTailscaleServe, isTailscaleIpv4, parseTailscaleStatus, readTailscaleStatus } from "./tailscale";

const v4 = (address: string, internal = false) => ({ address, family: "IPv4", internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: null }) as NetworkInterfaceInfo;
const v6 = (address: string) => ({ address, family: "IPv6", internal: false, netmask: "ffff::", mac: "00:00:00:00:00:00", cidr: null, scopeid: 0 }) as NetworkInterfaceInfo;
const status = JSON.stringify({ Self: { DNSName: "desk.tail1234.ts.net.", TailscaleIPs: ["100.101.1.2", "fd7a:115c:a1e0::1"], CapMap: { https: null } } });

describe("Tailscale detection", () => {
	it("reads the MagicDNS name, tailnet IPs and HTTPS capability", () => {
		expect(parseTailscaleStatus(status)).toEqual({ magicDnsName: "desk.tail1234.ts.net", tailnetIpv4Addresses: ["100.101.1.2"], httpsServeEnabled: true });
		expect(parseTailscaleStatus(JSON.stringify({ Self: { TailscaleIPs: [] } }))).toEqual({ magicDnsName: null, tailnetIpv4Addresses: [], httpsServeEnabled: null });
		expect(parseTailscaleStatus("not json")).toBeNull();
		expect(isTailscaleIpv4("100.64.0.1")).toBe(true);
		expect(isTailscaleIpv4("100.128.0.1")).toBe(false);
	});
	it("finds Tailscale by adapter name or IPv6 range even when the CLI doesn't answer", () => {
		expect(detectAddresses({ Tailscale: [v4("100.90.0.5")], Ethernet: [v4("192.168.1.20"), v4("127.0.0.1", true)] }, null)).toMatchObject({ tailscale: ["100.90.0.5"], lan: ["192.168.1.20"] });
		expect(detectAddresses({ utun4: [v4("100.90.0.6"), v6("fd7a:115c:a1e0::6")] }, null).tailscale).toEqual(["100.90.0.6"]);
	});
	it("doesn't take another VPN in the same range for Tailscale unless the CLI lists the address", () => {
		const interfaces = { "Other VPN": [v4("100.101.1.2")], "Carrier VPN": [v4("100.70.0.9")] };
		expect(detectAddresses(interfaces, null).tailscale).toEqual([]);
		expect(detectAddresses(interfaces, parseTailscaleStatus(status)).tailscale).toEqual(["100.101.1.2"]);
		expect(detectAddresses(interfaces, null).lan).toEqual([]);
	});
	it("returns null when Tailscale isn't installed", async () => {
		expect(await readTailscaleStatus(() => Promise.reject(Object.assign(new Error("spawn"), { code: "ENOENT" })))).toBeNull();
		expect(await readTailscaleStatus(async () => status, "win32")).toMatchObject({ magicDnsName: "desk.tail1234.ts.net" });
	});
	it("runs tailscale serve to loopback and names failures without quoting the CLI", async () => {
		const run = vi.fn(async () => "");
		await ensureTailscaleServe(47917, run, "win32");
		expect(run).toHaveBeenCalledWith("tailscale.exe", ["serve", "--bg", "--https=443", "http://127.0.0.1:47917"], 10_000);
		await expect(ensureTailscaleServe(47917, () => Promise.reject(Object.assign(new Error("exit 1"), { stderr: "error: not logged in, tskey-auth-secret" })), "linux")).rejects.toThrow("Sign in to Tailscale");
		await expect(ensureTailscaleServe(47917, () => Promise.reject(Object.assign(new Error("exit 1"), { stderr: "tskey-auth-secret weird" })), "linux")).rejects.not.toThrow("tskey");
	});
});

describe("address choice", () => {
	const detected = { lan: ["192.168.1.20"], tailscale: ["100.90.0.5"], status: null };
	it("binds only the chosen addresses, never all interfaces", () => {
		expect(bindHosts({ lan: false, "tailscale-ip": true, "tailscale-https": false }, detected, false)).toEqual(["100.90.0.5"]);
		expect(bindHosts({ lan: true, "tailscale-ip": true, "tailscale-https": false }, detected, false)).toEqual(["192.168.1.20", "100.90.0.5"]);
		expect(bindHosts({ lan: false, "tailscale-ip": false, "tailscale-https": false }, detected, true)).toEqual([]);
	});
	it("adds loopback only while Tailscale serves HTTPS to it", () => {
		expect(bindHosts({ lan: false, "tailscale-ip": false, "tailscale-https": true }, detected, false)).toEqual([]);
		expect(bindHosts({ lan: false, "tailscale-ip": false, "tailscale-https": true }, detected, true)).toEqual(["127.0.0.1"]);
	});
});
