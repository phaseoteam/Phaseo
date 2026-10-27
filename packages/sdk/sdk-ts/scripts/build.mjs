import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
// TypeScript 7 compiles. `typescript` is the TypeScript 6 API package (see pnpm-workspace.yaml).
const tsc = path.join(path.dirname(require.resolve("@typescript/native/package.json")), "bin/tsc");
await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
for (const config of ["tsconfig.build.json", "tsconfig.cjs.json"]) {
  const result = spawnSync(process.execPath, [tsc, "-p", config], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await mkdir(new URL("../dist/cjs", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/cjs/package.json", import.meta.url), '{"type":"commonjs"}\n');
