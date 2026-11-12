import type { Harness } from "../shared/workspace";

/** The npm packages agent CLIs are published as; Claude Code's native installer ships the same versions. */
const registryPackages: Partial<Record<Harness, string>> = { codex: "@openai/codex", claude: "@anthropic-ai/claude-code" };
const cacheMs = 6 * 3_600_000;
const cache = new Map<string, { at: number; version?: string }>();

const parse = (value: string) => /(\d+)\.(\d+)\.(\d+)/.exec(value)?.slice(1, 4).map(Number);

/** The published version when it is newer than the installed one, read from version text such as "2.1.280 (Claude Code)". */
export function newerVersion(installed: string | undefined, latest: string | undefined) {
	const current = installed ? parse(installed) : undefined, next = latest && /^\d+\.\d+\.\d+$/.test(latest) ? parse(latest) : undefined;
	if (!current || !next) return undefined;
	for (let index = 0; index < 3; index++) if (next[index] !== current[index]) return next[index] > current[index] ? latest : undefined;
	return undefined;
}

/**
 * The latest published version of an agent CLI, for Settings → Agents' "Update available". Checked at most every six hours
 * per agent, and only while Settings → Maintenance → Provider update checks is on; a failed check reads as nothing new.
 */
export async function latestHarnessVersion(harness: Harness, request: typeof fetch = fetch, now = Date.now()) {
	const name = registryPackages[harness];
	if (!name) return undefined;
	const cached = cache.get(name);
	if (cached && now - cached.at < cacheMs) return cached.version;
	let version: string | undefined;
	try {
		const response = await request(`https://registry.npmjs.org/${name.replaceAll("/", "%2F")}/latest`, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
		const body = response.ok ? await response.json() as { version?: unknown } : undefined;
		if (typeof body?.version === "string" && /^\d+\.\d+\.\d+$/.test(body.version)) version = body.version;
	} catch { /* Offline or the registry is unavailable. */ }
	cache.set(name, { at: now, version });
	return version;
}
