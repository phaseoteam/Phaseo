import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";
const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const home = NodeURL.fileURLToPath(new URL("../.phaseo/", import.meta.url));
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Start Phaseo development through pnpm dev:phaseo.");
NodeChildProcess.execFileSync(
  process.execPath,
  [pnpm, "--filter", "@phaseo/desktop-harness...", "build"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
const child = NodeChildProcess.spawn(
  process.execPath,
  [
    "scripts/dev-runner.ts",
    process.argv[2] ?? "dev:desktop",
    "--home-dir",
    home,
    ...process.argv.slice(3),
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, T3CODE_DISABLE_AUTO_UPDATE: "1" } },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
