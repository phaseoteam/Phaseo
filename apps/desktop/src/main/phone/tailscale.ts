import { execFile } from "node:child_process";
import type { NetworkInterfaceInfo } from "node:os";
import type { PhoneAddressKind } from "../../shared/phone";

export type TailscaleStatus = {
	magicDnsName: string | null;
	tailnetIpv4Addresses: string[];
	/** `tailscale serve --https` needs the tailnet's HTTPS certificates; null when the CLI has no capability map (older CLI). */
	httpsServeEnabled: boolean | null;
};
export type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;
export type DetectedAddresses = { lan: string[]; tailscale: string[]; status: TailscaleStatus | null };
/** Runs a command and returns its stdout, or rejects with { code, stderr } like execFile. */
export type RunCommand = (file: string, args: string[], timeoutMs: number) => Promise<string>;

/** Bounds `tailscale status`, which takes 1.8-2.6 s on Windows. */
const statusTimeoutMs = 3_500;
const serveTimeoutMs = 10_000;
const probeTimeoutMs = 2_500;
export const tailscaleServePort = 443;

const ipv4 = (address: string) => {
	const parts = address.split(".").map(part => /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN);
	return parts.length === 4 && parts.every(part => part >= 0 && part <= 255) ? parts : undefined;
};
/** 100.64.0.0/10, the range Tailscale gives each machine. Other VPNs share it, so it alone doesn't prove Tailscale. */
export function isTailscaleIpv4(address: string) { const parts = ipv4(address); return Boolean(parts && parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127); }
/** fd7a:115c:a1e0::/48, Tailscale's own IPv6 range. */
export const isTailscaleIpv6 = (address: string) => /^fd7a:115c:a1e0:/i.test(address);
/** Private IPv4 ranges a home or office Wi-Fi uses. */
export function isLanIpv4(address: string) {
	const parts = ipv4(address);
	if (!parts) return false;
	const [a, b] = parts as [number, number];
	return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function parseTailscaleStatus(json: string): TailscaleStatus | null {
	let value: unknown;
	try { value = JSON.parse(json); } catch { return null; }
	const self = value && typeof value === "object" ? (value as { Self?: unknown }).Self : undefined;
	if (!self || typeof self !== "object") return null;
	const { DNSName, TailscaleIPs, CapMap } = self as Record<string, unknown>;
	const dnsName = typeof DNSName === "string" ? DNSName.trim().replace(/\.$/, "") : "";
	return {
		magicDnsName: dnsName || null,
		tailnetIpv4Addresses: Array.isArray(TailscaleIPs) ? TailscaleIPs.filter((address): address is string => typeof address === "string" && isTailscaleIpv4(address)) : [],
		httpsServeEnabled: CapMap && typeof CapMap === "object" && !Array.isArray(CapMap) ? Object.hasOwn(CapMap, "https") : null,
	};
}

/**
 * This computer's addresses a phone can reach. A 100.64/10 address counts as Tailscale when its adapter is Tailscale's
 * (by name, or because it also holds a Tailscale IPv6 address) or the Tailscale CLI lists it, so another VPN in the same
 * range isn't offered as Tailscale. LAN addresses are private IPv4 on other adapters.
 */
export function detectAddresses(interfaces: NetworkInterfaces, status: TailscaleStatus | null): DetectedAddresses {
	const lan = new Set<string>(), tailscale = new Set<string>();
	for (const [name, addresses] of Object.entries(interfaces)) {
		if (!addresses) continue;
		const tailscaleAdapter = /^tailscale(?:\d+|ipv[46])?$/i.test(name) || addresses.some(address => !address.internal && address.family === "IPv6" && isTailscaleIpv6(address.address));
		for (const address of addresses) {
			if (address.internal || address.family !== "IPv4") continue;
			if (isTailscaleIpv4(address.address)) { if (tailscaleAdapter || status?.tailnetIpv4Addresses.includes(address.address)) tailscale.add(address.address); }
			else if (!tailscaleAdapter && isLanIpv4(address.address)) lan.add(address.address);
		}
	}
	return { lan: [...lan], tailscale: [...tailscale], status };
}

/** The hosts to listen on: only the addresses the person chose that exist now, and loopback for Tailscale Serve to forward to. Never 0.0.0.0. */
export function bindHosts(chosen: Record<PhoneAddressKind, boolean>, detected: DetectedAddresses, serving: boolean) {
	const hosts = [...chosen.lan ? detected.lan : [], ...chosen["tailscale-ip"] ? detected.tailscale : [], ...chosen["tailscale-https"] && serving ? ["127.0.0.1"] : []];
	return [...new Set(hosts)].filter(host => host !== "0.0.0.0");
}

export const tailscaleHttpsUrl = (dnsName: string) => `https://${dnsName}/`;

const executable = (platform: NodeJS.Platform) => platform === "win32" ? "tailscale.exe" : "tailscale";
export const runCommand: RunCommand = (file, args, timeoutMs) => new Promise((resolve, reject) => {
	execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stderr: String(stderr) })) : resolve(String(stdout)));
});

/** `tailscale status --json`, or null when Tailscale isn't installed, isn't running or doesn't answer in time. */
export async function readTailscaleStatus(run: RunCommand = runCommand, platform = process.platform) {
	try { return parseTailscaleStatus(await run(executable(platform), ["status", "--json"], statusTimeoutMs)); } catch { return null; }
}

/**
 * Failures named without quoting the CLI: its stderr can hold auth keys and machine names. Anything else gets a
 * general message.
 */
export function serveFailure(error: unknown) {
	const stderr = String((error as { stderr?: unknown })?.stderr ?? ""), code = (error as { code?: unknown })?.code;
	if (code === "ENOENT") return "Tailscale isn't installed on this computer.";
	if (/not logged in|logged out|needs? login/i.test(stderr)) return "Sign in to Tailscale on this computer first.";
	if (/permission denied|access denied|must be root|operation not permitted/i.test(stderr)) return "Tailscale needs permission to serve. On Linux, run `sudo tailscale set --operator=$USER` once.";
	if (/https|certificate|cert/i.test(stderr)) return "Turn on HTTPS certificates for your tailnet in the Tailscale admin console, then try again.";
	return "Tailscale couldn't set up HTTPS. Check that Tailscale is running and try again.";
}

/** Has Tailscale serve this computer's phone server over HTTPS at its MagicDNS name, forwarding to loopback. */
export async function ensureTailscaleServe(localPort: number, run: RunCommand = runCommand, platform = process.platform) {
	try { await run(executable(platform), ["serve", "--bg", `--https=${tailscaleServePort}`, `http://127.0.0.1:${localPort}`], serveTimeoutMs); }
	catch (error) { throw new Error(serveFailure(error), { cause: error }); }
}
export async function disableTailscaleServe(run: RunCommand = runCommand, platform = process.platform) {
	await run(executable(platform), ["serve", `--https=${tailscaleServePort}`, "off"], serveTimeoutMs).catch(() => undefined);
}
/** Whether the phone server answers through Tailscale's HTTPS name. */
export async function probeHttps(baseUrl: string, fetcher: typeof fetch = fetch) {
	try { return (await fetcher(new URL("v1/phone/health", baseUrl), { signal: AbortSignal.timeout(probeTimeoutMs), redirect: "error" })).ok; } catch { return false; }
}
