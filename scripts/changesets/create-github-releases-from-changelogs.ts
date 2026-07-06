import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

type ManifestType = "npm" | "pyproject";

interface PackageConfig {
    name: string;
    manifestPath: string;
    manifestType: ManifestType;
    changelogPath: string;
}

type ReleaseMode = "off" | "notable_only" | "all";
type ChangeBucket = "major" | "minor" | "patch" | "other";

const PACKAGES: PackageConfig[] = [
    // Gateway API
    {
        name: "@ai-stats/gateway-api",
        manifestPath: "apps/api/package.json",
        manifestType: "npm",
        changelogPath: "apps/api/CHANGELOG.md",
    },
    // SDKs
    {
        name: "@phaseo/ai-sdk-provider",
        manifestPath: "packages/integrations/ai-sdk-ai-stats/package.json",
        manifestType: "npm",
        changelogPath: "packages/integrations/ai-sdk-ai-stats/CHANGELOG.md",
    },
    {
        name: "@phaseo/sdk",
        manifestPath: "packages/sdk/sdk-ts/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-ts/CHANGELOG.md",
    },
    {
        name: "@phaseo/agent-sdk",
        manifestPath: "packages/sdk/agent-sdk-ts/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/agent-sdk-ts/CHANGELOG.md",
    },
    {
        name: "@phaseo/devtools-viewer",
        manifestPath: "packages/devtools/devtools-viewer/package.json",
        manifestType: "npm",
        changelogPath: "packages/devtools/devtools-viewer/CHANGELOG.md",
    },
    {
        name: "@ai-stats/py-sdk",
        manifestPath: "packages/sdk/sdk-py/pyproject.toml",
        manifestType: "pyproject",
        changelogPath: "packages/sdk/sdk-py/CHANGELOG.md",
    },
    {
        name: "@ai-stats/go-sdk",
        manifestPath: "packages/sdk/sdk-go/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-go/CHANGELOG.md",
    },
    {
        name: "@ai-stats/csharp-sdk",
        manifestPath: "packages/sdk/sdk-csharp/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-csharp/CHANGELOG.md",
    },
    {
        name: "@ai-stats/php-sdk",
        manifestPath: "packages/sdk/sdk-php/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-php/CHANGELOG.md",
    },
    {
        name: "@ai-stats/ruby-sdk",
        manifestPath: "packages/sdk/sdk-ruby/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-ruby/CHANGELOG.md",
    },
    {
        name: "@ai-stats/java-sdk",
        manifestPath: "packages/sdk/sdk-java/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-java/CHANGELOG.md",
    },
    {
        name: "@ai-stats/rust-sdk",
        manifestPath: "packages/sdk/sdk-rust/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-rust/CHANGELOG.md",
    },
    {
        name: "@ai-stats/cpp-sdk",
        manifestPath: "packages/sdk/sdk-cpp/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-cpp/CHANGELOG.md",
    },
];

function readFileOrNull(p: string): string | null {
    try {
        return fs.readFileSync(p, "utf8");
    } catch {
        return null;
    }
}

function getVersionFromManifest(content: string, type: ManifestType): string | null {
    if (type === "npm") {
        try {
            const pkg = JSON.parse(content);
            return typeof pkg.version === "string" ? pkg.version : null;
        } catch {
            return null;
        }
    }

    // pyproject.toml
    const match = content.match(/^version\s*=\s*["']([^"']+)["']/m);
    return match ? match[1] : null;
}

function getCurrentVersion(pkg: PackageConfig): string | null {
    const content = readFileOrNull(pkg.manifestPath);
    if (!content) return null;
    return getVersionFromManifest(content, pkg.manifestType);
}

function getPreviousVersion(pkg: PackageConfig): string | null {
    try {
        const content = execFileSync("git", ["show", `HEAD^:${pkg.manifestPath}`], {
            encoding: "utf8",
        });
        return getVersionFromManifest(content, pkg.manifestType);
    } catch {
        // No previous commit or file - treat as first release
        return null;
    }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractChangelogSection(changelogPath: string, version: string): string | null {
    const content = readFileOrNull(changelogPath);
    if (!content) return null;

    const lines = content.split(/\r?\n/);
    const headingRegex = new RegExp(`^##\\s+${escapeRegex(version)}\\b`);
    let start = -1;

    for (let i = 0; i < lines.length; i++) {
        if (headingRegex.test(lines[i])) {
            start = i;
            break;
        }
    }
    if (start === -1) return null;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i])) {
            end = i;
            break;
        }
    }

    const sectionLines = lines.slice(start, end);

    // Drop the "## x.y.z" heading - the GH release title already includes the version
    if (sectionLines[0]?.startsWith("##")) {
        sectionLines.shift();
    }

    const section = sectionLines.join("\n").trim();
    return section.length ? section : null;
}

function extractContributorHandles(markdown: string): string[] {
    const handles = new Set<string>();
    const matches = markdown.matchAll(/\[@([a-zA-Z0-9-]+)\]\(https?:\/\/github\.com\/[^\)]+\)/g);

    for (const match of matches) {
        handles.add(match[1]);
    }

    return [...handles].sort((a, b) => a.localeCompare(b));
}

function formatContributorList(handles: string[]): string {
    const linked = handles.map((handle) => `[@${handle}](https://github.com/${handle})`);
    if (linked.length === 0) return "";
    if (linked.length === 1) return linked[0];
    if (linked.length === 2) return `${linked[0]} and ${linked[1]}`;
    return `${linked.slice(0, -1).join(", ")}, and ${linked[linked.length - 1]}`;
}

function appendCredits(body: string, contributors: string[]): string {
    if (contributors.length === 0) return body;
    const credits = `## Credits\n\nHuge thanks to ${formatContributorList(contributors)} for helping!`;
    return `${body.trim()}\n\n${credits}`;
}

function bucketFromHeading(heading: string): ChangeBucket {
    const normalized = heading.toLowerCase();
    if (normalized.includes("major")) return "major";
    if (normalized.includes("minor")) return "minor";
    if (normalized.includes("patch")) return "patch";
    return "other";
}

function cleanBulletText(raw: string): string {
    let text = raw.replace(/\s+/g, " ").trim();

    const prLink = text.match(/\[#\d+\]\([^\)]+\)/)?.[0] ?? null;

    // Drop leading PR/commit link metadata that Changesets prepends.
    text = text.replace(/^(?:\[[^\]]+\]\([^\)]+\)\s*)+/, "");
    text = text.replace(/^Thanks\s+\[@[a-zA-Z0-9-]+\]\([^\)]+\)!?\s*-\s*/i, "");
    text = text.replace(/^\s*-\s*/, "");

    if (!text.length) {
        text = raw.replace(/\s+/g, " ").trim();
    }

    if (prLink && !text.includes(prLink)) {
        text = `${text} ${prLink}`;
    }

    return text.trim();
}

function parseChangelogBullets(markdown: string): Record<ChangeBucket, string[]> {
    const buckets: Record<ChangeBucket, string[]> = {
        major: [],
        minor: [],
        patch: [],
        other: [],
    };

    const lines = markdown.split(/\r?\n/);
    let currentBucket: ChangeBucket = "other";
    let currentBulletLines: string[] = [];

    const flushCurrentBullet = () => {
        if (!currentBulletLines.length) return;
        const text = cleanBulletText(currentBulletLines.join(" "));
        if (text.length) {
            buckets[currentBucket].push(text);
        }
        currentBulletLines = [];
    };

    for (const line of lines) {
        const headingMatch = line.match(/^###\s+(.+)$/);
        if (headingMatch) {
            flushCurrentBullet();
            currentBucket = bucketFromHeading(headingMatch[1]);
            continue;
        }

        const bulletMatch = line.match(/^\s*-\s+(.+)$/);
        if (bulletMatch) {
            flushCurrentBullet();
            currentBulletLines = [bulletMatch[1].trim()];
            continue;
        }

        if (!currentBulletLines.length) {
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

        currentBulletLines.push(trimmed);
    }

    flushCurrentBullet();
    return buckets;
}

function formatBulletLines(items: string[]): string {
    return items.map((item) => `- ${item}`).join("\n");
}

function formatReleaseBody(changelogSection: string): string {
    const buckets = parseChangelogBullets(changelogSection);
    const coreChanges = [...buckets.major, ...buckets.minor];
    const miscChanges = [...buckets.patch, ...buckets.other];
    const sections: string[] = [];

    if (coreChanges.length) {
        sections.push(`## Core Changes\n\n${formatBulletLines(coreChanges)}`);
    }

    if (miscChanges.length) {
        sections.push(`## Misc Changes\n\n${formatBulletLines(miscChanges)}`);
    }

    // Fallback for unusual changelog formats.
    if (!sections.length) {
        return changelogSection.trim();
    }

    return sections.join("\n\n");
}

function parseSemverParts(version: string): [number, number, number] | null {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isMajorBump(previous: string | null, current: string): boolean {
    if (!previous) return true;
    const prev = parseSemverParts(previous);
    const curr = parseSemverParts(current);
    if (!prev || !curr) return false;
    return curr[0] > prev[0];
}

function isMarkedNotable(changelogBody: string | null): boolean {
    if (!changelogBody) return false;
    return /#notable|\[notable\]|notable:\s*true/i.test(changelogBody);
}

function releaseExists(tag: string): boolean {
    try {
        execFileSync("gh", ["release", "view", tag], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

function main() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error("GITHUB_TOKEN is required");
    }

    const mode = (process.env.PHASEO_GH_RELEASE_MODE ?? "all").trim().toLowerCase() as ReleaseMode;
    if (mode === "off") {
        console.log("[releases] PHASEO_GH_RELEASE_MODE=off; skipping GitHub release creation");
        return;
    }
    if (mode !== "notable_only" && mode !== "all") {
        throw new Error(`Unsupported PHASEO_GH_RELEASE_MODE: ${mode}`);
    }

    for (const pkg of PACKAGES) {
        const current = getCurrentVersion(pkg);
        if (!current) {
            console.log(`[${pkg.name}] No current version found; skipping`);
            continue;
        }

        const previous = getPreviousVersion(pkg);
        if (previous === current) {
            console.log(
                `[${pkg.name}] Version did not change in last commit (${current}); skipping`,
            );
            continue;
        }

        const tag = `${pkg.name}@${current}`;
        const title = `${pkg.name} v${current}`;

        if (releaseExists(tag)) {
            console.log(`[${pkg.name}] Release ${tag} already exists; skipping`);
            continue;
        }

        const changelogSection =
            extractChangelogSection(pkg.changelogPath, current) ??
            `See CHANGELOG for ${pkg.name} v${current}.`;

        if (mode === "notable_only") {
            const major = isMajorBump(previous, current);
            const notable = isMarkedNotable(changelogSection);
            if (!major && !notable) {
                console.log(
                    `[${pkg.name}] Skipping GitHub release for non-major/non-notable update (${previous ?? "none"} -> ${current})`,
                );
                continue;
            }
        }

        const contributors = extractContributorHandles(changelogSection);
        const body = appendCredits(formatReleaseBody(changelogSection), contributors);

        const tmpPath = path.join(
            ".changeset",
            `gh-release-${pkg.name.replace("@", "").replace("/", "_")}-${current}.md`,
        );
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
        fs.writeFileSync(tmpPath, body, "utf8");

        console.log(`[${pkg.name}] Creating GitHub release ${tag}`);
        execFileSync(
            "gh",
            ["release", "create", tag, "--title", title, "--notes-file", tmpPath],
            { stdio: "inherit" },
        );
        fs.unlinkSync(tmpPath);
    }
}

main();
