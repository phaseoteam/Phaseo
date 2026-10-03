import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const children = new Set();

function run(command, args, options = {}) {
	const child = spawn(command, args, {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32",
		...options,
	});
	children.add(child);
	child.once("exit", () => children.delete(child));
	return child;
}

function waitForRenderer(attempt = 0) {
	return fetch("http://127.0.0.1:4100", { signal: AbortSignal.timeout(500) })
		.then(() => undefined)
		.catch(async () => {
			if (attempt > 100) throw new Error("Timed out waiting for the desktop renderer");
			await new Promise((resolve) => setTimeout(resolve, 100));
			return waitForRenderer(attempt + 1);
		});
}

function shutdown(signal) {
	for (const child of children) child.kill(signal);
	process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

const dependencies = run("pnpm", ["--filter", "@phaseo/agent-sdk...", "build"]);
const dependencyExit = await new Promise((resolve) => dependencies.once("exit", resolve));
if (dependencyExit !== 0) process.exit(Number(dependencyExit) || 1);

for (const target of ["build:main", "build:preload"]) {
	const child = run("pnpm", ["run", target]);
	const exitCode = await new Promise((resolve) => child.once("exit", resolve));
	if (exitCode !== 0) process.exit(Number(exitCode) || 1);
}

run("pnpm", ["exec", "vite", "--config", "vite.renderer.config.ts"]);
await waitForRenderer();

const electron = run("pnpm", ["exec", "electron", "."], {
	env: { ...process.env, PHASEO_DESKTOP_DEV_URL: "http://127.0.0.1:4100" },
});

electron.once("exit", (code) => {
	for (const child of children) child.kill("SIGTERM");
	process.exit(code ?? 0);
});
