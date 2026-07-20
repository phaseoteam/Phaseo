import { describe, expect, it } from "vitest";
import { resolveGatewayBaseUrlForEnvironment } from "@/chat/proxy";

describe("resolveGatewayBaseUrlForEnvironment", () => {
	it("uses only the configured gateway in production", () => {
		expect(resolveGatewayBaseUrlForEnvironment({ configuredBaseUrl: "https://private-gateway.example.com", requestedBaseUrl: "https://api.phaseo.app/v1", environment: "production" })).toBe("https://private-gateway.example.com/v1");
		expect(resolveGatewayBaseUrlForEnvironment({ configuredBaseUrl: "https://private-gateway.example.com", requestedBaseUrl: "http://127.0.0.1:8787/v1", environment: "production" })).toBe("https://private-gateway.example.com/v1");
		expect(resolveGatewayBaseUrlForEnvironment({ configuredBaseUrl: "https://private-gateway.example.com", requestedBaseUrl: "https://attacker.example.com/v1", environment: "production" })).toBe("https://private-gateway.example.com/v1");
	});

	it("fails closed in production when the gateway is not configured", () => {
		expect(resolveGatewayBaseUrlForEnvironment({ requestedBaseUrl: "https://api.phaseo.app/v1", environment: "production" })).toBeNull();
	});

	it("allows only explicit public, configured, and localhost targets outside production", () => {
		expect(resolveGatewayBaseUrlForEnvironment({ configuredBaseUrl: "https://private-gateway.example.com", requestedBaseUrl: "https://api.phaseo.app/v1", environment: "development" })).toBe("https://api.phaseo.app/v1");
		expect(resolveGatewayBaseUrlForEnvironment({ configuredBaseUrl: "https://private-gateway.example.com", requestedBaseUrl: "http://localhost:8787", environment: "development" })).toBe("http://localhost:8787/v1");
		expect(resolveGatewayBaseUrlForEnvironment({ configuredBaseUrl: "https://private-gateway.example.com", requestedBaseUrl: "https://attacker.example.com/v1", environment: "development" })).toBe("https://private-gateway.example.com/v1");
	});
});
