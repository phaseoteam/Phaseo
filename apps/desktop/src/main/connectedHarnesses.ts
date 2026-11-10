import type { Harness } from "../shared/workspace";

/** The checks behind the window's Settings: what is installed, whether a CLI is signed in, and what it lists. */
export type HarnessProbe = {
	installations: () => Promise<readonly { harness: Harness; installed: boolean }[]>;
	authenticated: (harness: "codex" | "claude" | "grok") => Promise<boolean>;
	models: (harness: "opencode" | "pi") => Promise<readonly unknown[]>;
};

/**
 * The local agents that can run a chat now: Codex, Claude Code and Grok when installed and signed in, OpenCode and Pi
 * when installed and listing models. A failed check counts as not connected.
 */
export async function localConnectedHarnesses(probe: HarnessProbe): Promise<Harness[]> {
	const installed = await probe.installations();
	const results = await Promise.all(installed.filter(value => value.installed).map(async ({ harness }): Promise<Harness | undefined> => {
		try {
			if (harness === "codex" || harness === "claude" || harness === "grok") return await probe.authenticated(harness) ? harness : undefined;
			if (harness === "opencode" || harness === "pi") return (await probe.models(harness)).length ? harness : undefined;
		} catch { /* An unavailable local login is not a connected runtime. */ }
		return undefined;
	}));
	return results.filter((value): value is Harness => !!value);
}

/**
 * localConnectedHarnesses, shared by the window and phones and kept for a minute: each check starts a CLI, and the
 * window refreshes on the same interval. Calls while one runs share it.
 */
export function cachedConnectedHarnesses(probe: HarnessProbe, maxAgeMs = 60_000, now = Date.now) {
	let value: { at: number; harnesses: Promise<Harness[]> } | undefined;
	return (force = false) => {
		if (!force && value && now() - value.at < maxAgeMs) return value.harnesses;
		const harnesses = localConnectedHarnesses(probe);
		value = { at: now(), harnesses };
		// A failed run isn't kept, so the next call checks again.
		harnesses.catch(() => { if (value?.harnesses === harnesses) value = undefined; });
		return harnesses;
	};
}
