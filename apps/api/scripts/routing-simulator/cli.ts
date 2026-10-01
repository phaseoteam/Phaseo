import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url));
const api = resolve(here, "../..");
const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) {
  console.log("Usage: pnpm exec tsx scripts/routing-simulator/cli.ts <scenario.json|--suite|--deep|--deep-bursts|--compare> [output-directory]\nRun from apps/api. Reports are saved even when targets fail. No provider credentials or server needed.");
  process.exit(args.length ? 0 : 1);
}
if (args.length > 2) throw new Error("Expected scenario path and optional output directory");
if (args[0].startsWith("--") && !["--suite","--deep","--deep-bursts","--compare"].includes(args[0])) throw new Error("Unknown simulator command");
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const runtimeDirectory = resolve(here,"results");
mkdirSync(runtimeDirectory,{recursive:true});
const runtimeFile = resolve(runtimeDirectory,`.standalone-${process.pid}.mjs`);
const bundle = await build({entryPoints:[resolve(here,"standalone.ts")],bundle:true,write:false,format:"esm",platform:"node",target:"node22",alias:{"@/runtime/env":resolve(here,"runtime.ts"),"@":resolve(api,"src"),"@core":resolve(api,"src/core")}});
writeFileSync(runtimeFile,bundle.outputFiles[0].text);
const output = resolve(args[1] ?? `scripts/routing-simulator/results/${Date.now()}`);
const child = spawnSync(process.execPath, [runtimeFile], {
  cwd: api, stdio: "inherit", windowsHide: true,
  env: { ...process.env, ROUTING_SIM_SCENARIO: args[0].startsWith("--") ? "" : resolve(args[0]), ROUTING_SIM_SUITE: args[0] === "--suite" ? "1" : "", ROUTING_SIM_DEEP: ["--deep","--deep-bursts"].includes(args[0]) ? "1" : "", ROUTING_SIM_COMPARE:args[0]==="--compare"?"1":"", ROUTING_SIM_BURSTS:args[0]==="--deep-bursts"?"1":"", ROUTING_SIM_OUTPUT: output },
});
unlinkSync(runtimeFile);
if (child.error) throw child.error;
process.exit(child.status ?? 1);
