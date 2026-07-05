import { resolveGatewayBaseUrlForEnvironment } from "@/app/api/chat/_shared/gatewayProxy";

describe("resolveGatewayBaseUrlForEnvironment", () => {
	it("uses only the configured gateway in production", () => {
		expect(
			resolveGatewayBaseUrlForEnvironment({
				configuredBaseUrl: "https://private-gateway.example.com",
				requestedBaseUrl: "https://api.phaseo.app/v1",
				nodeEnv: "production",
			}),
		).toBe("https://private-gateway.example.com/v1");

		expect(
			resolveGatewayBaseUrlForEnvironment({
				configuredBaseUrl: "https://private-gateway.example.com",
				requestedBaseUrl: "http://127.0.0.1:8787/v1",
				nodeEnv: "production",
			}),
		).toBe("https://private-gateway.example.com/v1");

		expect(
			resolveGatewayBaseUrlForEnvironment({
				configuredBaseUrl: "https://private-gateway.example.com",
				requestedBaseUrl: "https://attacker.example.com/v1",
				nodeEnv: "production",
			}),
		).toBe("https://private-gateway.example.com/v1");
	});

	it("fails closed in production when the gateway is not configured", () => {
		expect(
			resolveGatewayBaseUrlForEnvironment({
				requestedBaseUrl: "https://api.phaseo.app/v1",
				nodeEnv: "production",
			}),
		).toBeNull();
	});

	it("allows explicit public and localhost gateway targets in development", () => {
		expect(
			resolveGatewayBaseUrlForEnvironment({
				configuredBaseUrl: "https://private-gateway.example.com",
				requestedBaseUrl: "https://api.phaseo.app/v1",
				nodeEnv: "development",
			}),
		).toBe("https://api.phaseo.app/v1");

		expect(
			resolveGatewayBaseUrlForEnvironment({
				configuredBaseUrl: "https://private-gateway.example.com",
				requestedBaseUrl: "http://localhost:8787",
				nodeEnv: "development",
			}),
		).toBe("http://localhost:8787/v1");
	});

	it("does not allow arbitrary gateway targets in development", () => {
		expect(
			resolveGatewayBaseUrlForEnvironment({
				configuredBaseUrl: "https://private-gateway.example.com",
				requestedBaseUrl: "https://attacker.example.com/v1",
				nodeEnv: "development",
			}),
		).toBe("https://private-gateway.example.com/v1");
	});
});
