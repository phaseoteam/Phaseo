import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

await mkdir("dist/plugin", { recursive: true });
execFileSync(
  "tar",
  ["-czf", "dist/plugin/phaseo.tar.gz", "-C", "plugin", "phaseo"],
  { stdio: "inherit" },
);
console.log("Plugin package: apps/mcp/dist/plugin/phaseo.tar.gz");
