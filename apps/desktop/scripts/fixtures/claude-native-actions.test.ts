import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const fixture = fileURLToPath(new URL("./claude-native-actions.cjs", import.meta.url));

it.each([
	{ args: ["--version"], output: "2.1.80 (Claude Code)" },
	{ args: ["auth", "status"], output: JSON.stringify({ loggedIn: false }) },
])("completes the $args CLI probe without waiting for SDK input", async ({ args, output }) => {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-claude-fixture-"));
	writeFileSync(path.join(directory, "catalog-mode"), "available");
	try {
		// execFile keeps stdin open, just as the desktop's native CLI probes do.
		const result = await execute(process.execPath, [fixture], {
			timeout: 5_000,
			windowsHide: true,
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: "1",
				PHASEO_OWNED_CLAUDE_ROOT: directory,
				PHASEO_OWNED_CLAUDE_ARGS: args.join("\u0001"),
			},
		});
		expect(result.stdout.trim()).toBe(output);
		expect(result.stderr).toBe("");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
