import { describe, expect, it } from "vitest";
import { publicGrafanaConfig } from "./grafanaConfig";

describe("public monitoring configuration", () => {
	it("exposes only public settings and requires an explicit supported environment", () => {
		const env = { PHASEO_ENV: "production", PUBLIC_FARO_ENABLED: "true", PUBLIC_FARO_URL: "https://faro-collector-prod-eu-west-0.grafana.net/collect/test", GRAFANA_OTLP_AUTHORIZATION: "private", PUBLIC_FARO_SESSION_SAMPLE_RATE: "0.1" };
		expect(publicGrafanaConfig(env)).toEqual({ enabled: true, url: env.PUBLIC_FARO_URL, environment: "production", sampleRate: 0.1 });
		expect(publicGrafanaConfig({ ...env, PHASEO_ENV: "preview" }).enabled).toBe(false);
		expect(publicGrafanaConfig({ ...env, PUBLIC_FARO_ENABLED: "false" }).enabled).toBe(false);
		expect(publicGrafanaConfig({ ...env, PUBLIC_FARO_URL: "https://attacker.example/collect/test" }).enabled).toBe(false);
		expect(JSON.stringify(publicGrafanaConfig(env))).not.toContain("private");
	});
});
