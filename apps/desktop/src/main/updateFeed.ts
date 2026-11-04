/** Stamped into the main bundle by vite.main.config.ts from PHASEO_DESKTOP_UPDATE_URL at build time; absent under vitest. */
declare const __PHASEO_DESKTOP_UPDATE_URL__: string | undefined;

export const builtInUpdateFeedUrl: string | undefined = typeof __PHASEO_DESKTOP_UPDATE_URL__ === "undefined" ? undefined : __PHASEO_DESKTOP_UPDATE_URL__ || undefined;

/**
 * The update feed. Packaged builds only trust the URL stamped in at build time: a runtime environment variable could otherwise
 * point the updater at an attacker's feed. Development runs may override it with PHASEO_DESKTOP_UPDATE_URL.
 */
export function resolveUpdateFeedUrl(isPackaged: boolean, env: NodeJS.ProcessEnv, builtIn: string | undefined = builtInUpdateFeedUrl): string | undefined {
	if (!isPackaged) return env.PHASEO_DESKTOP_UPDATE_URL?.trim() || builtIn;
	return builtIn;
}
