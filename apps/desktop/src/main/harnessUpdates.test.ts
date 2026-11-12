import { describe, expect, it, vi } from "vitest";
import { latestHarnessVersion, newerVersion } from "./harnessUpdates";

describe("agent CLI update checks", () => {
	it("offers a published version only when it is newer than the installed one", () => {
		expect(newerVersion("2.1.280 (Claude Code)", "2.1.284")).toBe("2.1.284");
		expect(newerVersion("codex-cli 0.50.0", "0.50.0")).toBeUndefined();
		expect(newerVersion("1.10.0", "1.9.9")).toBeUndefined();
		expect(newerVersion("1.9.9", "2.0.0")).toBe("2.0.0");
		expect(newerVersion("Version unknown", "2.0.0")).toBeUndefined();
		expect(newerVersion("1.0.0", "2.0.0-beta.1")).toBeUndefined();
	});

	it("asks the registry for Claude Code and Codex only, at most every six hours", async () => {
		const request = vi.fn(async () => new Response(JSON.stringify({ version: "9.9.9" })));
		expect(await latestHarnessVersion("opencode", request as typeof fetch, 0)).toBeUndefined();
		expect(await latestHarnessVersion("codex", request as typeof fetch, 1_000)).toBe("9.9.9");
		expect(await latestHarnessVersion("codex", request as typeof fetch, 2_000)).toBe("9.9.9");
		expect(request).toHaveBeenCalledTimes(1);
		expect(String((request.mock.calls[0] as unknown[])[0])).toBe("https://registry.npmjs.org/@openai%2Fcodex/latest");
		const failing = vi.fn(async () => { throw new Error("offline"); });
		expect(await latestHarnessVersion("claude", failing as typeof fetch, 1_000)).toBeUndefined();
	});
});
