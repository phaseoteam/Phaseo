import { spawnSync } from "node:child_process";

function runChangesetPublish() {
  const result = spawnSync("pnpm", ["exec", "changeset", "publish"], {
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

const attempt = runChangesetPublish();

process.exit(attempt.status);
