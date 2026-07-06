import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RELEVANT_PATH_PREFIXES = [
  "apps/docs/openapi/v1/openapi.yaml",
  "packages/sdk/sdk-ts/src/oapi-gen/",
  "packages/sdk/sdk-ts/src/index.ts",
  "packages/sdk/sdk-ts/src/modelIds.ts",
  "packages/sdk/sdk-py/src/gen/",
  "packages/sdk/sdk-py/src/ai_stats/__init__.py",
  "packages/sdk/sdk-py/src/ai_stats/model_ids.py",
  "packages/sdk/sdk-go/src/gen/",
  "packages/sdk/sdk-go/index.go",
  "packages/sdk/sdk-go/go.mod",
  "packages/sdk/sdk-go/model_ids.go",
  "packages/sdk/sdk-csharp/src/gen/",
  "packages/sdk/sdk-csharp/Client.cs",
  "packages/sdk/sdk-csharp/AIStats.Sdk.csproj",
  "packages/sdk/sdk-csharp/ModelIds.cs",
  "packages/sdk/sdk-java/src/gen/",
  "packages/sdk/sdk-java/pom.xml",
  "packages/sdk/sdk-java/src/ai/stats/sdk/ModelIds.java",
  "packages/sdk/sdk-php/src/gen/",
  "packages/sdk/sdk-php/src/index.php",
  "packages/sdk/sdk-php/composer.json",
  "packages/sdk/sdk-php/src/ModelIds.php",
  "packages/sdk/sdk-ruby/lib/gen/",
  "packages/sdk/sdk-ruby/lib/index.rb",
  "packages/sdk/sdk-ruby/src/gen/",
  "packages/sdk/sdk-ruby/lib/ai_stats_sdk/version.rb",
  "packages/sdk/sdk-ruby/ai_stats_sdk.gemspec",
  "packages/sdk/sdk-ruby/lib/ai_stats_sdk/model_ids.rb",
];
const SDK_PACKAGES = [
  "@phaseo/sdk",
  "@ai-stats/py-sdk",
  "@ai-stats/go-sdk",
  "@ai-stats/csharp-sdk",
  "@ai-stats/java-sdk",
  "@ai-stats/php-sdk",
  "@ai-stats/ruby-sdk",
];

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

function commitExists(ref) {
  if (!ref) return false;
  try {
    execSync(`git cat-file -e ${ref}^{commit}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findRange() {
  const head = process.env.GITHUB_SHA || "HEAD";
  const fromEnv = process.env.GITHUB_EVENT_BEFORE;

  if (commitExists(fromEnv) && fromEnv !== "0000000000000000000000000000000000000000") {
    return { base: fromEnv, head };
  }

  const fallback = git("rev-parse HEAD~1");
  return { base: fallback, head };
}

function hasRelevantChanges(base, head) {
  const namesRaw = git(`diff --name-only ${base} ${head}`);
  const names = namesRaw ? namesRaw.split(/\r?\n/).filter(Boolean) : [];
  return names.some((file) =>
    RELEVANT_PATH_PREFIXES.some((prefix) => file === prefix || file.startsWith(prefix))
  );
}

function getDiff(base, head, filePath) {
  try {
    return git(`diff --unified=0 ${base} ${head} -- "${filePath}"`);
  } catch {
    return "";
  }
}

function extractKnownModelIdsFromTsConstantsDiff(diff) {
  const added = new Set();
  const removed = new Set();
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) continue;
    let match = line.match(/^\+\s+[A-Z0-9_]+:\s+"([^"]+\/[^"]+)"/);
    if (match) added.add(match[1]);
    match = line.match(/^\-\s+[A-Z0-9_]+:\s+"([^"]+\/[^"]+)"/);
    if (match) removed.add(match[1]);
  }
  return { added, removed };
}

function mergeSets(...sets) {
  const merged = new Set();
  for (const set of sets) {
    for (const value of set) merged.add(value);
  }
  return merged;
}

function computeAutoBump(base, head) {
  const helperDiff = getDiff(base, head, "packages/sdk/sdk-ts/src/modelIds.ts");
  const helperChange = extractKnownModelIdsFromTsConstantsDiff(helperDiff);
  const added = mergeSets(helperChange.added);
  const removed = mergeSets(helperChange.removed);

  if (added.size > 0 || removed.size > 0) {
    const sample = Array.from(new Set([...added, ...removed])).slice(0, 6).join(", ");
    return {
      bump: "patch",
      reason: `callable helper model IDs changed (${added.size} added, ${removed.size} removed) [${sample}]`,
    };
  }

  return {
    bump: "patch",
    reason: "sdk/openapi changes",
  };
}

function hasManualChangeset(changesetDir) {
  if (!fs.existsSync(changesetDir)) return false;
  return fs
    .readdirSync(changesetDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .some(
      (entry) =>
        entry.name !== "README.md" &&
        !entry.name.startsWith("auto-sdk-release-"),
    );
}

function isReleaseVersionCommit(head) {
  const message = git(`log -1 --pretty=%B ${head}`);
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return false;

  const versionTitleRe = /^Version Packages(?:\s+\(#\d+\))?$/;
  if (versionTitleRe.test(lines[0])) return true;

  if (/^Merge pull request #\d+ /.test(lines[0]) && lines[1] && versionTitleRe.test(lines[1])) {
    return true;
  }

  return false;
}

function createAutoChangeset(changesetDir, head, bump, reason) {
  const shortSha = git(`rev-parse --short ${head}`);
  const filename = `auto-sdk-release-${shortSha}.md`;
  const filepath = path.join(changesetDir, filename);
  const body = [
    "---",
    ...SDK_PACKAGES.map((pkg) => `"${pkg}": ${bump}`),
    "---",
    "",
    `Auto-release functional SDK packages after OpenAPI or model-surface changes (${reason}).`,
    "",
    "Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.",
    "",
  ].join("\n");

  fs.writeFileSync(filepath, body, "utf8");
  console.log(`[changesets] created ${filepath} (bump=${bump}; reason=${reason})`);
}

function main() {
  const changesetDir = path.resolve(".changeset");
  const { base, head } = findRange();
  console.log(`[changesets] inspecting diff range ${base}..${head}`);

  if (isReleaseVersionCommit(head)) {
    console.log("[changesets] release-version commit detected; skipping auto changeset");
    return;
  }

  if (!hasRelevantChanges(base, head)) {
    console.log("[changesets] no SDK/OpenAPI changes detected; skipping auto changeset");
    return;
  }

  if (hasManualChangeset(changesetDir)) {
    console.log("[changesets] manual changeset already present; skipping auto changeset");
    return;
  }

  const auto = computeAutoBump(base, head);
  createAutoChangeset(changesetDir, head, auto.bump, auto.reason);
}

main();
