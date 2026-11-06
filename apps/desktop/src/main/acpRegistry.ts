import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AcpRegistryAgent, AcpRegistryLaunch } from "../shared/acpRegistry";

const run = promisify(execFile);
export const ACP_REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const ICON_HOST = "cdn.agentclientprotocol.com";
/** Exact versions only, so an added agent never changes under the person. */
const npmPackage = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*@\d[\w.+-]*$/i, pythonPackage = /^[A-Za-z0-9][\w.-]*(==|@)\d[\w.+-]*$/;
/** cmd.exe runs npx on Windows, so arguments stay plain words there. */
const plainArgument = /^[\w@./:=+,-]+$/;
const ARCHIVE_LIMIT = 600 * 1024 * 1024;

type Distribution = { package?: unknown; args?: unknown; env?: unknown; archive?: unknown; cmd?: unknown; sha256?: unknown };
const strings = (value: unknown) => Array.isArray(value) && value.length <= 30 && value.every(item => typeof item === "string" && item.length <= 500) ? value as string[] : undefined;
const environment = (value: unknown) => {
	if (value === undefined) return {};
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const entries = Object.entries(value as Record<string, unknown>);
	return entries.length <= 30 && entries.every(([name, text]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && typeof text === "string" && text.length <= 2000) ? Object.fromEntries(entries) as Record<string, string> : undefined;
};
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const https = (value: unknown) => { try { const url = new URL(String(value)); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } };

/** The registry's name for this computer, such as windows-x86_64 or darwin-aarch64. */
export const platformKey = (platform = process.platform, arch = process.arch) => `${platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : "linux"}-${arch === "arm64" ? "aarch64" : "x86_64"}`;

/** Agents this computer can run, with each way to start them; a binary first, as it needs no Node or Python. */
export function parseRegistry(value: unknown, platform = process.platform, arch = process.arch): AcpRegistryAgent[] {
	const agents = (value as { agents?: unknown })?.agents;
	if (!Array.isArray(agents)) throw new Error("The agent registry could not be read.");
	const key = platformKey(platform, arch);
	return agents.slice(0, 512).flatMap((entry: Record<string, unknown>): AcpRegistryAgent[] => {
		const id = text(entry?.id, 128), name = text(entry?.name, 160), version = text(entry?.version, 128);
		if (!/^[a-z0-9][a-z0-9._-]*$/.test(id) || !name || !version) return [];
		const distribution = (entry.distribution ?? {}) as Record<string, Distribution & Record<string, Distribution>>;
		const launches: AcpRegistryLaunch[] = [];
		const binary = distribution.binary?.[key];
		const binaryArchive = https(binary?.archive), cmd = text(binary?.cmd, 300);
		if (binary && binaryArchive && cmd && !path.isAbsolute(cmd)) {
			const args = strings(binary.args ?? []), env = environment(binary.env), sha256 = typeof binary.sha256 === "string" && /^[a-f0-9]{64}$/i.test(binary.sha256) ? binary.sha256.toLowerCase() : undefined;
			if (args && env) launches.push({ kind: "binary", archive: binaryArchive, cmd, args, env, ...(sha256 ? { sha256 } : {}) });
		}
		for (const kind of ["npx", "uvx"] as const) {
			const source = distribution[kind], pkg = text(source?.package, 214), args = strings(source?.args ?? []), env = environment(source?.env);
			if (!source || !args || !env || !(kind === "npx" ? npmPackage : pythonPackage).test(pkg)) continue;
			if (platform === "win32" && kind === "npx" && !args.every(arg => plainArgument.test(arg))) continue;
			launches.push({ kind, package: pkg, args, env });
		}
		if (!launches.length) return [];
		const icon = https(entry.icon);
		return [{
			id, name, version, description: text(entry.description, 1024), authors: (strings(entry.authors) ?? []).slice(0, 8),
			license: text(entry.license, 128) || undefined, website: https(entry.website), repository: https(entry.repository),
			icon: icon && new URL(icon).hostname === ICON_HOST ? icon : undefined, launches,
		}];
	}).sort((a, b) => a.name.localeCompare(b.name));
}

let cached: { at: number; agents: AcpRegistryAgent[] } | undefined;
/** The registry, read at most hourly; `fresh` reads it again. */
export async function readRegistry(fresh = false, fetcher: typeof fetch = fetch) {
	if (!fresh && cached && Date.now() - cached.at < 60 * 60_000) return cached.agents;
	const response = await fetcher(ACP_REGISTRY_URL, { signal: AbortSignal.timeout(20_000) });
	if (!response.ok) throw new Error(`The agent registry answered ${response.status}.`);
	cached = { at: Date.now(), agents: parseRegistry(await response.json()) };
	return cached.agents;
}

/**
 * The command that starts an agent one way. npx and uvx fetch the exact version at launch; a binary is downloaded
 * once into `root/<id>/<version>`, checked against the registry's SHA-256 when it gives one, and unpacked.
 */
export async function prepareLaunch(agent: AcpRegistryAgent, launch: AcpRegistryLaunch, root: string, platform = process.platform, fetcher: typeof fetch = fetch): Promise<{ executable: string; arguments: string[]; environment: Record<string, string> }> {
	if (launch.kind !== "binary") {
		if (launch.kind === "uvx") return { executable: "uvx", arguments: [launch.package, ...launch.args], environment: launch.env };
		return platform === "win32"
			? { executable: process.env.ComSpec || "cmd.exe", arguments: ["/d", "/s", "/c", "npx", "--yes", launch.package, ...launch.args], environment: launch.env }
			: { executable: "npx", arguments: ["--yes", launch.package, ...launch.args], environment: launch.env };
	}
	const directory = path.join(root, agent.id, agent.version.replace(/[^\w.+-]/g, "_"));
	const target = path.resolve(directory, launch.cmd);
	if (!target.startsWith(path.resolve(directory) + path.sep)) throw new Error("The registry gave a command outside the agent's folder.");
	const executable = async () => { for (const candidate of platform === "win32" && !/\.\w+$/.test(target) ? [target, `${target}.exe`, `${target}.cmd`] : [target]) { try { await access(candidate); return candidate; } catch { /* Next candidate. */ } } };
	const existing = await executable();
	if (existing) return { executable: existing, arguments: launch.args, environment: launch.env };
	const response = await fetcher(launch.archive, { signal: AbortSignal.timeout(10 * 60_000) });
	if (!response.ok) throw new Error(`Downloading ${agent.name} failed (${response.status}).`);
	const data = Buffer.from(await response.arrayBuffer());
	if (data.length > ARCHIVE_LIMIT) throw new Error(`${agent.name}'s download is larger than expected.`);
	if (launch.sha256 && createHash("sha256").update(data).digest("hex") !== launch.sha256) throw new Error(`${agent.name}'s download does not match the registry's checksum, so it was not installed.`);
	await rm(directory, { recursive: true, force: true }); await mkdir(directory, { recursive: true });
	const name = new URL(launch.archive).pathname.split("/").at(-1) ?? "agent-archive", archive = path.join(directory, `.download-${name.replace(/[^\w.-]/g, "_")}`);
	await writeFile(archive, data);
	try {
		if (platform === "win32") await run(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", archive, "-C", directory], { windowsHide: true });
		else if (/\.zip$/i.test(name)) await run("unzip", ["-q", "-o", archive, "-d", directory]);
		else await run("tar", ["-xf", archive, "-C", directory]);
	} finally { await rm(archive, { force: true }); }
	const installed = await executable();
	if (!installed) throw new Error(`${agent.name} was unpacked, but ${launch.cmd} is not in it.`);
	if (platform !== "win32") await run("chmod", ["+x", installed]).catch(() => undefined);
	return { executable: installed, arguments: launch.args, environment: launch.env };
}
