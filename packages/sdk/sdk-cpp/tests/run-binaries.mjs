import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDirectory = fileURLToPath(new URL(".", import.meta.url));

for (const executable of ["core_contract.exe", "parameter_support.exe"]) {
  const result = spawnSync(`${testDirectory}${executable}`, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
