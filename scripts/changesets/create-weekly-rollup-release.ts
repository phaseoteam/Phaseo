import fs from "node:fs";
import { execSync } from "node:child_process";

type ManifestType = "npm" | "pyproject";

type PackageConfig = {
  name: string;
  manifestPath: string;
  manifestType: ManifestType;
  changelogPath: string;
};

const PACKAGES: PackageConfig[] = [
  { name: "@ai-stats/gateway-api", manifestPath: "apps/api/package.json", manifestType: "npm", changelogPath: "apps/api/CHANGELOG.md" },
  { name: "@ai-stats/sdk", manifestPath: "packages/sdk/sdk-ts/package.json", manifestType: "npm", changelogPath: "packages/sdk/sdk-ts/CHANGELOG.md" },
  { name: "@ai-stats/py-sdk", manifestPath: "packages/sdk/sdk-py/pyproject.toml", manifestType: "pyproject", changelogPath: "packages/sdk/sdk-py/CHANGELOG.md" },
  { name: "@ai-stats/go-sdk", manifestPath: "packages/sdk/sdk-go/package.json", manifestType: "npm", changelogPath: "packages/sdk/sdk-go/CHANGELOG.md" },
  { name: "@ai-stats/csharp-sdk", manifestPath: "packages/sdk/sdk-csharp/package.json", manifestType: "npm", changelogPath: "packages/sdk/sdk-csharp/CHANGELOG.md" },
  { name: "@ai-stats/java-sdk", manifestPath: "packages/sdk/sdk-java/package.json", manifestType: "npm", changelogPath: "packages/sdk/sdk-java/CHANGELOG.md" },
  { name: "@ai-stats/php-sdk", manifestPath: "packages/sdk/sdk-php/package.json", manifestType: "npm", changelogPath: "packages/sdk/sdk-php/CHANGELOG.md" },
  { name: "@ai-stats/ruby-sdk", manifestPath: "packages/sdk/sdk-ruby/package.json", manifestType: "npm", changelogPath: "packages/sdk/sdk-ruby/CHANGELOG.md" },
];

function run(command: string): string {
  return execSync(command, { encoding: "utf8" }).trim();
}

function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function getVersion(manifestPath: string, manifestType: ManifestType): string | null {
  if (!fileExists(manifestPath)) return null;
  const content = fs.readFileSync(manifestPath, "utf8");
  if (manifestType === "npm") {
    try {
      const parsed = JSON.parse(content);
      return typeof parsed.version === "string" ? parsed.version : null;
    } catch {
      return null;
    }
  }
  const match = content.match(/^version\s*=\s*["']([^"']+)["']/m);
  return match ? match[1] : null;
}

function hasChangedSince(days: number, targetPath: string): boolean {
  try {
    const log = run(`git log --since="${days} days ago" --pretty=format:%H -- "${targetPath}"`);
    return log.length > 0;
  } catch {
    return false;
  }
}

function extractLatestChangelogBullet(changelogPath: string): string | null {
  if (!fileExists(changelogPath)) return null;
  const content = fs.readFileSync(changelogPath, "utf8");
  const lines = content.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    if (!inSection && /^##\s+/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (inSection && line.trim().startsWith("- ")) {
      return line.trim();
    }
  }
  return null;
}

function releaseExists(tag: string): boolean {
  try {
    execSync(`gh release view "${tag}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required");
  }

  const days = Number(process.env.ROLLUP_DAYS ?? "7");
  if (!Number.isFinite(days) || days < 1) {
    throw new Error(`Invalid ROLLUP_DAYS: ${process.env.ROLLUP_DAYS}`);
  }

  const changedPackages = PACKAGES.flatMap((pkg) => {
    const changed = hasChangedSince(days, pkg.manifestPath) || hasChangedSince(days, pkg.changelogPath);
    if (!changed) return [];
    const version = getVersion(pkg.manifestPath, pkg.manifestType);
    if (!version) return [];
    const note = extractLatestChangelogBullet(pkg.changelogPath);
    return [{ ...pkg, version, note }];
  });

  if (!changedPackages.length) {
    console.log(`[rollup] no package changes in last ${days} day(s), skipping`);
    return;
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const date = `${yyyy}-${mm}-${dd}`;
  const tag = `rollup-${date}`;
  const title = `SDK & API Rollup - ${date}`;

  if (releaseExists(tag)) {
    console.log(`[rollup] release already exists for ${tag}, skipping`);
    return;
  }

  const packageLines = changedPackages
    .map((pkg) => {
      const note = pkg.note ? `\n${pkg.note}` : "";
      return `- **${pkg.name}** \`${pkg.version}\`${note}`;
    })
    .join("\n");

  const body = [
    `Weekly rollup covering the last **${days} day(s)**.`,
    "",
    "## Changed Packages",
    packageLines,
    "",
    "## Notes",
    "- GitHub Releases are high-signal milestones/rollups.",
    "- Full package-level details remain in each package CHANGELOG.",
  ].join("\n");

  const notesFile = ".changeset/weekly-rollup-notes.md";
  fs.mkdirSync(".changeset", { recursive: true });
  fs.writeFileSync(notesFile, body, "utf8");
  try {
    execSync(`gh release create "${tag}" --title "${title}" --notes-file "${notesFile}"`, {
      stdio: "inherit",
    });
  } finally {
    fs.unlinkSync(notesFile);
  }
}

main();
