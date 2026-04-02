import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Bump = "none" | "patch" | "minor" | "major";

const ENFORCED_PACKAGES = [
  "@ai-stats/sdk",
  "@ai-stats/py-sdk",
  "@ai-stats/go-sdk",
  "@ai-stats/csharp-sdk",
  "@ai-stats/java-sdk",
  "@ai-stats/php-sdk",
  "@ai-stats/ruby-sdk",
] as const;
const BUMP_SCORE: Record<Bump, number> = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
};

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

function extractModelIdsFromManifestDiff(diff: string): { added: Set<string>; removed: Set<string> } {
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) continue;
    let match = line.match(/^\+\s*"([^"]+\/[^"]+)"/);
    if (match) added.add(match[1]);
    match = line.match(/^\-\s*"([^"]+\/[^"]+)"/);
    if (match) removed.add(match[1]);
  }
  return { added, removed };
}

function extractModelIdsFromTsUnionDiff(diff: string): { added: Set<string>; removed: Set<string> } {
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) continue;
    let match = line.match(/^\+\s*\|\s*"([^"]+)"/);
    if (match) added.add(match[1]);
    match = line.match(/^\-\s*\|\s*"([^"]+)"/);
    if (match) removed.add(match[1]);
  }
  return { added, removed };
}

function mergeSets(...sets: Set<string>[]): Set<string> {
  const merged = new Set<string>();
  for (const set of sets) {
    for (const value of set) merged.add(value);
  }
  return merged;
}

function getChangesetFiles(): string[] {
  const dir = path.resolve(".changeset");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => path.join(dir, entry.name));
}

function parseChangesetBumps(files: string[]): Map<string, Bump> {
  const bumps = new Map<string, Bump>();
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const frontMatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) continue;
    const frontMatter = frontMatterMatch[1];
    const re = /"([^"]+)"\s*:\s*(patch|minor|major)|^([@\w./-]+)\s*:\s*(patch|minor|major)$/gm;
    let match: RegExpExecArray | null;
    while ((match = re.exec(frontMatter)) !== null) {
      const pkg = match[1] ?? match[3];
      const bump = (match[2] ?? match[4]) as Bump;
      if (!pkg || !bump) continue;
      const current = bumps.get(pkg) ?? "none";
      if (BUMP_SCORE[bump] > BUMP_SCORE[current]) {
        bumps.set(pkg, bump);
      }
    }
  }
  return bumps;
}

function ensureRequiredBump(
  bumps: Map<string, Bump>,
  required: Bump,
  reason: string,
): void {
  if (required === "none") return;
  for (const pkg of ENFORCED_PACKAGES) {
    const actual = bumps.get(pkg) ?? "none";
    if (BUMP_SCORE[actual] < BUMP_SCORE[required]) {
      throw new Error(
        `[semver] ${reason}. ${pkg} requires at least ${required}, found ${actual}.`,
      );
    }
  }
}

function main(): void {
  const { base, head } = findRange();
  console.log(`[semver] inspecting ${base}..${head}`);

  const manifestDiff = getDiff(base, head, "packages/data/catalog/src/data/manifest.json");
  const tsUnionDiff = getDiff(base, head, "packages/sdk/sdk-ts/src/oapi-gen/models/ModelId.ts");

  const manifestChange = extractModelIdsFromManifestDiff(manifestDiff);
  const tsChange = extractModelIdsFromTsUnionDiff(tsUnionDiff);
  const added = mergeSets(manifestChange.added, tsChange.added);
  const removed = mergeSets(manifestChange.removed, tsChange.removed);

  if (!added.size && !removed.size) {
    console.log("[semver] no model-id surface changes detected");
    return;
  }

  const required: Bump = removed.size > 0 ? "major" : "minor";
  const sample = Array.from(removed.size > 0 ? removed : added).slice(0, 6).join(", ");
  const reason =
    removed.size > 0
      ? `model IDs removed (${removed.size}) [${sample}]`
      : `model IDs added (${added.size}) [${sample}]`;

  const changesetFiles = getChangesetFiles();
  const bumps = parseChangesetBumps(changesetFiles);
  ensureRequiredBump(bumps, required, reason);
  console.log(`[semver] validated: required ${required} bump for model-id surface changes`);
}

main();
