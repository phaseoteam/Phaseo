import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const localWebApiOrigin =
	process.env.WEB_API_ORIGIN ?? "http://127.0.0.1:8788";

const services = [
	{
		name: "Cloudflare web API",
		args: ["--filter", "@phaseo/web-api", "dev"],
		env: process.env,
	},
	{
		name: "Next.js web app",
		args: ["--filter", "@phaseo/web", "dev"],
		env: {
			...process.env,
			WEB_API_ORIGIN: localWebApiOrigin,
		},
	},
];

let shuttingDown = false;
const children = services.map((service) => {
	const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
	const args = isWindows
		? ["/d", "/s", "/c", ["pnpm", ...service.args].join(" ")]
		: service.args;
	const child = spawn(command, args, {
		cwd: rootDirectory,
		env: service.env,
		stdio: "inherit",
		windowsHide: true,
	});

	child.on("exit", (code, signal) => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.error(
			`${service.name} exited (${signal ?? `code ${code ?? 1}`}); stopping the remaining dev service.`,
		);
		for (const sibling of children) {
			if (sibling !== child && !sibling.killed) sibling.kill("SIGTERM");
		}
		process.exitCode = code ?? 1;
	});

	return child;
});

function stopChildren(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	for (const child of children) {
		if (!child.killed) child.kill(signal);
	}
}

process.on("SIGINT", () => stopChildren("SIGINT"));
process.on("SIGTERM", () => stopChildren("SIGTERM"));
