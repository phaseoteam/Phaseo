import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRegistry, prepareLaunch } from "./acpRegistry";

const registry = { version: "1", agents: [
	{ id: "gemini", name: "Gemini CLI", version: "0.67.0", description: "Google's agent", authors: ["Google"], license: "Apache-2.0", icon: "https://cdn.agentclientprotocol.com/registry/v1/latest/gemini.svg", distribution: { npx: { package: "@google/gemini-cli@0.67.0", args: ["--acp"] } } },
	{ id: "goose", name: "Goose", version: "1.57.0", description: "", icon: "https://evil.example/goose.svg", distribution: { binary: { "windows-x86_64": { archive: "https://github.com/block/goose/releases/download/v1.57.0/goose-windows.zip", cmd: "./goose.exe", args: ["acp"], sha256: "a".repeat(64) }, "darwin-aarch64": { archive: "https://example.com/goose.tar.gz", cmd: "./goose" } } } },
	{ id: "fast-agent", name: "fast-agent", version: "0.10.1", distribution: { uvx: { package: "fast-agent-acp==0.10.1", args: ["-x"], env: { FAST_AGENT_MODEL: "codexplan" } } } },
	{ id: "floating", name: "Floating", version: "1.0.0", distribution: { npx: { package: "floating-agent@latest" } } },
	{ id: "risky", name: "Risky", version: "1.0.0", distribution: { npx: { package: "risky@1.0.0", args: ["--x=$(rm)&"] } } },
	{ id: "Bad Id", name: "Bad", version: "1", distribution: { npx: { package: "bad@1.0.0" } } },
] };

describe("ACP agent registry", () => {
	it("lists the agents this computer can run, with exact versions and the registry's own icons", () => {
		const windows = parseRegistry(registry, "win32", "x64");
		expect(windows.map(agent => agent.id)).toEqual(["fast-agent", "gemini", "goose"]);
		expect(windows.find(agent => agent.id === "goose")).toMatchObject({ icon: undefined, launches: [{ kind: "binary", cmd: "./goose.exe", sha256: "a".repeat(64) }] });
		expect(windows.find(agent => agent.id === "gemini")?.icon).toBe("https://cdn.agentclientprotocol.com/registry/v1/latest/gemini.svg");
		// A plain word argument list is required only where cmd.exe runs npx.
		expect(parseRegistry(registry, "linux", "x64").map(agent => agent.id)).toEqual(["fast-agent", "gemini", "risky"]);
		expect(parseRegistry(registry, "darwin", "arm64").find(agent => agent.id === "goose")?.launches[0]).toMatchObject({ kind: "binary", cmd: "./goose" });
	});

	it("starts npx agents through cmd on Windows and uvx agents directly, with their variables", async () => {
		const [fast, gemini] = parseRegistry(registry, "win32", "x64");
		const npx = await prepareLaunch(gemini, gemini.launches[0], tmpdir(), "win32");
		expect(npx.arguments).toEqual(["/d", "/s", "/c", "npx", "--yes", "@google/gemini-cli@0.67.0", "--acp"]);
		expect(await prepareLaunch(gemini, gemini.launches[0], tmpdir(), "linux")).toMatchObject({ executable: "npx", arguments: ["--yes", "@google/gemini-cli@0.67.0", "--acp"] });
		expect(await prepareLaunch(fast, fast.launches[0], tmpdir(), "win32")).toEqual({ executable: "uvx", arguments: ["fast-agent-acp==0.10.1", "-x"], environment: { FAST_AGENT_MODEL: "codexplan" } });
	});

	it("refuses a download that does not match the registry's checksum", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-acp-registry-"));
		try {
			const goose = parseRegistry(registry, "win32", "x64").find(agent => agent.id === "goose")!;
			const fetcher = (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch;
			await expect(prepareLaunch(goose, goose.launches[0], root, "win32", fetcher)).rejects.toThrow("checksum");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
