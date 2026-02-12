import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

type ManifestType = "npm" | "pyproject";

interface PackageConfig {
    name: string;
    manifestPath: string;
    manifestType: ManifestType;
    changelogPath: string;
}

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
        name: "@ai-stats/ai-sdk-provider",
        manifestPath: "packages/integrations/ai-sdk-ai-stats/package.json",
        manifestType: "npm",
        changelogPath: "packages/integrations/ai-sdk-ai-stats/CHANGELOG.md",
    },
    {
        name: "@ai-stats/sdk",
        manifestPath: "packages/sdk/sdk-ts/package.json",
        manifestType: "npm",
        changelogPath: "packages/sdk/sdk-ts/CHANGELOG.md",
    },
    {
        name: "@ai-stats/devtools-viewer",
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
        const content = execSync(`git show HEAD^:${pkg.manifestPath}`, {
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

    return [...handles];
}

function formatContributorList(handles: string[]): string {
    const linked = handles.map((handle) => `[@${handle}](https://github.com/${handle})`);
    if (linked.length === 0) return "";
    if (linked.length === 1) return linked[0];
    if (linked.length === 2) return `${linked[0]} and ${linked[1]}`;
    return `${linked.slice(0, -1).join(", ")}, and ${linked[linked.length - 1]}`;
}

function appendCredits(body: string): string {
    const contributors = extractContributorHandles(body);
    if (contributors.length === 0) return body;

    const credits = `## Credits\n\nHuge thanks to ${formatContributorList(contributors)} for helping!`;
    return `${body.trim()}\n\n---\n\n${credits}`;
}

function releaseExists(tag: string): boolean {
    try {
        execSync(`gh release view "${tag}"`, { stdio: "ignore" });
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
        const body = appendCredits(changelogSection);

        const tmpPath = path.join(
            ".changeset",
            `gh-release-${pkg.name.replace("@", "").replace("/", "_")}-${current}.md`,
        );
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
        fs.writeFileSync(tmpPath, body, "utf8");

        console.log(`[${pkg.name}] Creating GitHub release ${tag}`);
        execSync(
            `gh release create "${tag}" --title "${title}" --notes-file "${tmpPath}"`,
            { stdio: "inherit" },
        );
        fs.unlinkSync(tmpPath);
    }
}

main();
