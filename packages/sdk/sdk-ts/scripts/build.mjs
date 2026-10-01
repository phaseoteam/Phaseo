import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
for (const config of ["tsconfig.build.json", "tsconfig.cjs.json"]) {
  const result = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", config], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await mkdir(new URL("../dist/cjs", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/cjs/package.json", import.meta.url), '{"type":"commonjs"}\n');
