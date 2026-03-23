import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RELEVANT_PATH_PREFIXES = [
  "apps/docs/openapi/v1/openapi.yaml",
  "packages/sdk/sdk-ts/src/oapi-gen/",
  "packages/sdk/sdk-ts/src/index.ts",
  "packages/sdk/sdk-py/src/gen/",
  "packages/sdk/sdk-py/src/ai_stats/__init__.py",
  "packages/sdk/sdk-go/src/gen/",
  "packages/sdk/sdk-go/index.go",
  "packages/sdk/sdk-go/go.mod",
  "packages/sdk/sdk-csharp/src/gen/",
  "packages/sdk/sdk-csharp/Client.cs",
  "packages/sdk/sdk-csharp/AIStats.Sdk.csproj",
  "packages/sdk/sdk-java/src/gen/",
  "packages/sdk/sdk-java/pom.xml",
  "packages/sdk/sdk-php/src/gen/",
  "packages/sdk/sdk-php/src/index.php",
  "packages/sdk/sdk-php/composer.json",
  "packages/sdk/sdk-ruby/lib/gen/",
  "packages/sdk/sdk-ruby/lib/index.rb",
  "packages/sdk/sdk-ruby/src/gen/",
  "packages/sdk/sdk-ruby/lib/ai_stats_sdk/version.rb",
  "packages/sdk/sdk-ruby/ai_stats_sdk.gemspec",
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

function headCommitSubject(head) {
  return git(`log -1 --pretty=%s ${head}`);
}

function isReleaseVersionCommit(head) {
  const subject = headCommitSubject(head);
  return /^Version Packages(?:\s+\(#\d+\))?$/.test(subject);
}

function createAutoChangeset(changesetDir, head) {
  const shortSha = git(`rev-parse --short ${head}`);
  const filename = `auto-sdk-release-${shortSha}.md`;
  const filepath = path.join(changesetDir, filename);
  const body = [
    "---",
    "\"@ai-stats/sdk\": patch",
    "\"@ai-stats/py-sdk\": patch",
    "\"@ai-stats/go-sdk\": patch",
    "\"@ai-stats/csharp-sdk\": patch",
    "\"@ai-stats/java-sdk\": patch",
    "\"@ai-stats/php-sdk\": patch",
    "\"@ai-stats/ruby-sdk\": patch",
    "---",
    "",
    "Auto-release functional SDK packages after OpenAPI or model-surface changes.",
    "",
    "Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.",
    "",
  ].join("\n");

  fs.writeFileSync(filepath, body, "utf8");
  console.log(`[changesets] created ${filepath}`);
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

  createAutoChangeset(changesetDir, head);
}

main();
