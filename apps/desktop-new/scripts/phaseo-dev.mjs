import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const home = fileURLToPath(new URL("../.phaseo/", import.meta.url));
const child = spawn(process.execPath, ["scripts/dev-runner.ts", process.argv[2] ?? "dev:desktop", "--home-dir", home, ...process.argv.slice(3)], { cwd: root, stdio: "inherit", env: { ...process.env, T3CODE_DISABLE_AUTO_UPDATE: "1" } });
child.on("exit", code => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
