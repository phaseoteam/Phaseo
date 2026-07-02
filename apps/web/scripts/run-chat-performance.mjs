import { spawnSync } from "node:child_process";

const result = spawnSync(
	"pnpm",
	[
		"exec",
		"playwright",
		"test",
		"tests/e2e/chat-performance.spec.ts",
		"--project=chromium",
		"--reporter=list",
	],
	{
		env: {
			...process.env,
			CHAT_PERF_E2E: "1",
		},
		shell: process.platform === "win32",
		stdio: "inherit",
	},
);

process.exit(result.status ?? 1);
