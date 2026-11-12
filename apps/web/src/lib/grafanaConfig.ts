import { browserCollector } from "../../../../packages/shared/observability/browser.mjs";

export function publicGrafanaConfig(env: Record<string, unknown>) {
	const url = browserCollector(env.PUBLIC_FARO_URL);
	const environment = String(env.PHASEO_ENV ?? "");
	const rate = Number(env.PUBLIC_FARO_SESSION_SAMPLE_RATE ?? "0.1");
	return {
		enabled: env.PUBLIC_FARO_ENABLED === "true" && ["production", "staging"].includes(environment) && Boolean(url),
		url, environment, sampleRate: Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0.1,
	};
}
export type GrafanaBrowserConfig = ReturnType<typeof publicGrafanaConfig>;
