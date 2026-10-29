// Development: Vite serves the renderer with hot reload; Electron runs the built main process against it.
// Pass --demo to use fixture data instead of GitHub.
import { spawn, spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const run = (args) => spawnSync(pnpm, args, { stdio: "inherit", shell: process.platform === "win32" });

if (run(["run", "build:main"]).status !== 0 || run(["run", "build:preload"]).status !== 0) process.exit(1);

const vite = spawn(pnpm, ["exec", "vite", "--config", "vite.renderer.config.ts"], { stdio: "inherit", shell: process.platform === "win32" });
const env = { ...process.env, PHASEO_FACTORY_DEV_URL: "http://127.0.0.1:4300" };
delete env.ELECTRON_RUN_AS_NODE;
const electron = spawn(pnpm, ["exec", "electron", ".", ...process.argv.slice(2)], { stdio: "inherit", env, shell: process.platform === "win32" });

const stop = () => {
	vite.kill();
	electron.kill();
};
electron.on("exit", () => {
	vite.kill();
	process.exit(0);
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
