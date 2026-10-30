import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import { createServer } from "vite";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const children = new Set();
let renderer;
let stopping = false;

function run(command, args, options = {}) {
	const child = spawn(command, args, {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32",
		windowsHide: true,
		...options,
	});
	children.add(child);
	child.once("exit", () => children.delete(child));
	return child;
}

async function shutdown(signal, code = 0) {
	if (stopping) return;
	stopping = true;
	await renderer?.close();
	for (const child of children) child.kill(signal);
	process.exit(code);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

const dependencies = run("pnpm", ["--filter", "@phaseo/agent-sdk...", "build"]);
const dependencyExit = await new Promise((resolve) => dependencies.once("exit", resolve));
if (dependencyExit !== 0) process.exit(Number(dependencyExit) || 1);

for (const target of ["build:main", "build:preload"]) {
	const child = run("pnpm", ["run", target]);
	const exitCode = await new Promise((resolve) => child.once("exit", resolve));
	if (exitCode !== 0) process.exit(Number(exitCode) || 1);
}

try {
	renderer = await createServer({ configFile: fileURLToPath(new URL("../vite.renderer.config.ts", import.meta.url)) });
	await renderer.listen();
	renderer.printUrls();
} catch (error) {
	console.error(error);
	await shutdown("SIGTERM", 1);
}

const electron = run(electronPath, ["."], {
	shell: false,
	windowsHide: false,
	env: { ...process.env, PHASEO_DESKTOP_DEV_URL: "http://127.0.0.1:4100" },
});

electron.once("error", error => { console.error(error); void shutdown("SIGTERM", 1); });
electron.once("exit", code => void shutdown("SIGTERM", code ?? 0));
