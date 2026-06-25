import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { configDirPath } from "./session.js";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "./generated/meta.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type UpdateCheckCache = {
	checkedAt: number;
	latestVersion: string;
};

export type VersionInfo = {
	name: string;
	version: string;
	packageManager: PackageManager;
	installCommand: string;
	updateCommand: string;
	latestVersion: string | null;
	updateAvailable: boolean;
};

const UPDATE_CHECK_TTL_MS = 12 * 60 * 60 * 1000;

function updateCachePath(): string {
	return join(configDirPath(), "update-check.json");
}

function normalizeVersion(input: string): number[] {
	const trimmed = input.trim().replace(/^v/i, "");
	return trimmed
		.split(".")
		.map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ""), 10))
		.map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(a: string, b: string): number {
	const left = normalizeVersion(a);
	const right = normalizeVersion(b);
	const limit = Math.max(left.length, right.length);
	for (let index = 0; index < limit; index += 1) {
		const leftPart = left[index] ?? 0;
		const rightPart = right[index] ?? 0;
		if (leftPart > rightPart) return 1;
		if (leftPart < rightPart) return -1;
	}
	return 0;
}

export function detectPackageManager(env: NodeJS.ProcessEnv = process.env): PackageManager {
	const userAgent = String(env.npm_config_user_agent ?? "").toLowerCase();
	if (userAgent.startsWith("pnpm/")) return "pnpm";
	if (userAgent.startsWith("yarn/")) return "yarn";
	if (userAgent.startsWith("bun/")) return "bun";
	return "npm";
}

export function installCommandFor(manager: PackageManager): string {
	if (manager === "pnpm") return "pnpm add -g @ai-stats/cli";
	if (manager === "yarn") return "yarn global add @ai-stats/cli";
	if (manager === "bun") return "bun add -g @ai-stats/cli";
	return "npm install -g @ai-stats/cli";
}

export function updateCommandFor(manager: PackageManager): string {
	if (manager === "pnpm") return "pnpm add -g @ai-stats/cli@latest";
	if (manager === "yarn") return "yarn global add @ai-stats/cli@latest";
	if (manager === "bun") return "bun add -g @ai-stats/cli@latest";
	return "npm install -g @ai-stats/cli@latest";
}

async function readUpdateCache(): Promise<UpdateCheckCache | null> {
	try {
		const raw = await readFile(updateCachePath(), "utf8");
		const parsed = JSON.parse(raw) as Partial<UpdateCheckCache>;
		if (typeof parsed.checkedAt !== "number" || typeof parsed.latestVersion !== "string") {
			return null;
		}
		return {
			checkedAt: parsed.checkedAt,
			latestVersion: parsed.latestVersion,
		};
	} catch {
		return null;
	}
}

async function writeUpdateCache(cache: UpdateCheckCache): Promise<void> {
	const path = updateCachePath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

async function fetchLatestVersion(packageName: string): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 1500);
	try {
		const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
			signal: controller.signal,
			headers: {
				accept: "application/json",
			},
		});
		if (!response.ok) return null;
		const body = await response.json() as { version?: unknown };
		return typeof body.version === "string" && body.version.trim() ? body.version.trim() : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function lookupLatestVersion(options: { force?: boolean } = {}): Promise<string | null> {
	const force = options.force === true;
	if (!force) {
		const cached = await readUpdateCache();
		if (cached && Date.now() - cached.checkedAt < UPDATE_CHECK_TTL_MS) {
			return cached.latestVersion;
		}
	}
	const latestVersion = await fetchLatestVersion(CLI_PACKAGE_NAME);
	if (latestVersion) {
		await writeUpdateCache({
			checkedAt: Date.now(),
			latestVersion,
		}).catch(() => undefined);
	}
	return latestVersion;
}

export async function getVersionInfo(options: { lookupLatest?: boolean; forceLatestLookup?: boolean } = {}): Promise<VersionInfo> {
	const packageManager = detectPackageManager();
	const latestVersion =
		options.lookupLatest || options.forceLatestLookup
			? await lookupLatestVersion({ force: options.forceLatestLookup })
			: null;
	return {
		name: CLI_PACKAGE_NAME,
		version: CLI_VERSION,
		packageManager,
		installCommand: installCommandFor(packageManager),
		updateCommand: updateCommandFor(packageManager),
		latestVersion,
		updateAvailable: latestVersion ? compareVersions(latestVersion, CLI_VERSION) > 0 : false,
	};
}
