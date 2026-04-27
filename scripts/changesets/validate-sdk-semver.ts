import { execSync } from "node:child_process";

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

function commitExists(ref?: string): boolean {
  if (!ref) return false;
  try {
    execSync(`git cat-file -e ${ref}^{commit}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findRange(): { base: string; head: string } {
  const head = process.env.GITHUB_SHA || "HEAD";
  const fromEnv = process.env.GITHUB_EVENT_BEFORE;
  if (commitExists(fromEnv) && fromEnv !== "0000000000000000000000000000000000000000") {
    return { base: fromEnv, head };
  }
  return { base: git("rev-parse HEAD~1"), head };
}

function getDiff(base: string, head: string, filePath: string): string {
  try {
    return git(`diff --unified=0 ${base} ${head} -- "${filePath}"`);
  } catch {
    return "";
  }
}

function extractKnownModelIdsFromTsConstantsDiff(diff: string): { added: Set<string>; removed: Set<string> } {
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) continue;
    let match = line.match(/^\+\s+[A-Z0-9_]+:\s+"([^"]+\/[^"]+)"/);
    if (match) added.add(match[1]);
    match = line.match(/^\-\s+[A-Z0-9_]+:\s+"([^"]+\/[^"]+)"/);
    if (match) removed.add(match[1]);
  }
  return { added, removed };
}

function main(): void {
  const { base, head } = findRange();
  console.log(`[semver] inspecting ${base}..${head}`);

  const helperDiff = getDiff(base, head, "packages/sdk/sdk-ts/src/modelIds.ts");
  const { added, removed } = extractKnownModelIdsFromTsConstantsDiff(helperDiff);

  if (!added.size && !removed.size) {
    console.log("[semver] no callable helper model-id changes detected");
    return;
  }

  const sample = Array.from(new Set([...added, ...removed])).slice(0, 6).join(", ");
  console.log(
    `[semver] callable helper model IDs changed (${added.size} added, ${removed.size} removed) [${sample}]`,
  );
  console.log(
    "[semver] no minor/major enforcement: model catalogs and helper constants are treated as runtime data snapshots, not semver-driving API surface.",
  );
}

main();
