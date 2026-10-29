import { execFile } from "node:child_process";
import os from "node:os";
import type { UpdateInfo } from "../shared/types";

/**
 * Factory's releases live in the Phaseo monorepo, beside the SDKs' releases, as `@phaseo/factory@1.2.3`
 * (the tag changesets gives it). GitHub's "latest release" is whichever package shipped last, so Factory
 * reads the release list and keeps its own tags. The repository is public: no sign-in is needed.
 */
export const RELEASES_REPO = process.env.PHASEO_FACTORY_RELEASES_REPO || "phaseoteam/Phaseo";
export const TAG_PREFIX = "@phaseo/factory@";

interface GithubRelease {
	tag_name: string;
	name?: string | null;
	body?: string | null;
	html_url: string;
	draft: boolean;
	prerelease: boolean;
	published_at?: string | null;
	assets?: { name: string; browser_download_url: string; size: number }[];
}

/** 1.2.3 against 1.10.0, and a pre-release (1.2.3-beta.1) before its release. Negative when a is older. */
export function compareVersions(a: string, b: string): number {
	const parse = (version: string) => {
		const [main = "", pre] = version.replace(/^v/, "").split("-", 2);
		return { parts: main.split(".").map((part) => Number(part) || 0), pre };
	};
	const left = parse(a);
	const right = parse(b);
	for (let index = 0; index < 3; index++) {
		const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0);
		if (difference) return difference;
	}
	if (left.pre === right.pre) return 0;
	if (!left.pre) return 1;
	if (!right.pre) return -1;
	return left.pre.localeCompare(right.pre, "en", { numeric: true });
}

/** This computer's download among a release's files: the platform's name in it, and the architecture when there's a choice. */
export function pickDownload(assets: GithubRelease["assets"], platform = process.platform, arch = process.arch): UpdateInfo["download"] {
	const names = { win32: /win|windows|\.exe$|\.msi$/i, darwin: /mac|darwin|osx|\.dmg$/i, linux: /linux|\.appimage$|\.deb$|\.rpm$/i } as Record<string, RegExp>;
	const forPlatform = (assets ?? []).filter((asset) => names[platform]?.test(asset.name) && !/\.(yml|yaml|blockmap|sha256|sig)$/i.test(asset.name));
	const otherArch = arch === "arm64" ? /x64|x86_64|amd64/i : /arm64|aarch64/i;
	const best = forPlatform.find((asset) => new RegExp(arch === "x64" ? "x64|x86_64|amd64" : arch, "i").test(asset.name)) ?? forPlatform.find((asset) => !otherArch.test(asset.name));
	return best ? { name: best.name, url: best.browser_download_url, bytes: best.size } : undefined;
}

/** The newest Factory release above the running version, or null when this is the newest. Pre-releases only when asked for. */
export function newestRelease(releases: GithubRelease[], current: string, prerelease = false): UpdateInfo | null {
	const ours = releases
		.filter((release) => release.tag_name.startsWith(TAG_PREFIX) && !release.draft && (prerelease || !release.prerelease))
		.map((release) => ({ release, version: release.tag_name.slice(TAG_PREFIX.length) }))
		.filter(({ version }) => /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version))
		.sort((a, b) => compareVersions(b.version, a.version));
	const newest = ours[0];
	if (!newest || compareVersions(newest.version, current) <= 0) return null;
	return {
		version: newest.version,
		url: newest.release.html_url,
		notes: newest.release.body?.trim() || undefined,
		publishedAt: newest.release.published_at ? Date.parse(newest.release.published_at) : undefined,
		prerelease: newest.release.prerelease || undefined,
		download: pickDownload(newest.release.assets),
	};
}

/** The release list, from GitHub's API; through gh's sign-in when the hourly limit for signed-out requests is used up. */
async function releases(): Promise<GithubRelease[]> {
	const path = `repos/${RELEASES_REPO}/releases?per_page=100`;
	const response = await fetch(`https://api.github.com/${path}`, { headers: { accept: "application/vnd.github+json", "user-agent": `phaseo-factory (${os.platform()})` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
	if (response?.ok) return (await response.json()) as GithubRelease[];
	return new Promise((resolve, reject) => {
		execFile("gh", ["api", path], { cwd: os.tmpdir(), windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
			if (error) reject(new Error(response ? `GitHub answered ${response.status}` : "GitHub couldn't be reached"));
			else resolve(JSON.parse(stdout) as GithubRelease[]);
		});
	});
}

export async function checkForUpdate(current: string, prerelease = false): Promise<UpdateInfo | null> {
	return newestRelease(await releases(), current, prerelease);
}
