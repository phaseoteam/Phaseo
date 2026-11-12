import { describe, expect, it } from "vitest";
import { isAllowedAzureByokEndpoint, validateProviderKey } from "./settings-byok";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";

function azureKey(endpointUrl: string): string {
	return JSON.stringify({ deployments: [{ modelSlug: "openai/gpt-4.1", endpointUrl, apiKey: "azure-key", modelId: "gpt-41" }] });
}

describe("BYOK credential validation", () => {
	it.each([
		"https://customer.openai.azure.com",
		"https://customer.services.ai.azure.com/openai/v1/",
		"https://customer.cognitiveservices.azure.com",
		"https://customer.openai.azure.us",
	])("accepts the Azure endpoint %s", (endpoint) => {
		expect(isAllowedAzureByokEndpoint(endpoint)).toBe(true);
		expect(validateProviderKey("azure", azureKey(endpoint)).strict).toBe(true);
	});

	it.each([
		"http://169.254.169.254/latest/meta-data",
		"https://169.254.169.254",
		"http://customer.openai.azure.com",
		"https://localhost",
		"https://internal.example.com",
		"https://openai.azure.com.attacker.example",
		"https://a.b.openai.azure.com",
		"https://customer.openai.azure.com:8443",
		"https://user:pass@customer.openai.azure.com",
		"https://customer.openai.azure.com/?x=1",
	])("rejects the Azure endpoint %s", (endpoint) => {
		expect(isAllowedAzureByokEndpoint(endpoint)).toBe(false);
		expect(() => validateProviderKey("azure", azureKey(endpoint))).toThrow("Azure endpoints must be");
	});

	it("requires a 32-character hexadecimal Cloudflare account id", () => {
		expect(validateProviderKey("cloudflare", JSON.stringify({ apiToken: "token", accountId: ACCOUNT_ID })).strict).toBe(true);
		for (const accountId of ["customer-account", "../../zones", `${ACCOUNT_ID}/ai/run`, ACCOUNT_ID.slice(1)]) {
			expect(() => validateProviderKey("cloudflare", JSON.stringify({ apiToken: "token", accountId })))
				.toThrow("32-character hexadecimal");
		}
	});
});
