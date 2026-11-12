import { describe, expect, it } from "vitest";
import { isCloudflareAccountId, normalizeAzureByokEndpoint, validateProviderCredential } from "./provider-credentials";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";

function azureKey(endpointUrl: string): string {
	return JSON.stringify({ deployments: [{ modelSlug: "openai/gpt-4.1", endpointUrl, apiKey: "azure-key", modelId: "gpt-41" }] });
}

describe("BYOK endpoint rules", () => {
	it.each([
		["https://customer.openai.azure.com", "https://customer.openai.azure.com/"],
		["https://customer.services.ai.azure.com/openai/v1/", "https://customer.services.ai.azure.com/openai/v1/"],
		["https://customer.cognitiveservices.azure.com", "https://customer.cognitiveservices.azure.com/"],
		["https://customer.openai.azure.cn", "https://customer.openai.azure.cn/"],
	])("accepts the Azure endpoint %s", (endpoint, normalized) => {
		expect(normalizeAzureByokEndpoint(endpoint)).toBe(normalized);
		expect(validateProviderCredential("azure", azureKey(endpoint)).strict).toBe(true);
	});

	it.each([
		"http://169.254.169.254/latest/meta-data",
		"https://169.254.169.254",
		"https://[::1]",
		"http://customer.openai.azure.com",
		"https://localhost",
		"https://internal.example.com",
		"https://openai.azure.com.attacker.example",
		"https://a.b.openai.azure.com",
		"https://customer.openai.azure.com:8443",
		"https://user:pass@customer.openai.azure.com",
		"https://customer.openai.azure.com/?x=1",
	])("rejects the Azure endpoint %s on save", (endpoint) => {
		expect(normalizeAzureByokEndpoint(endpoint)).toBeNull();
		expect(() => validateProviderCredential("azure", azureKey(endpoint))).toThrow("Azure endpoints must be");
	});

	it("requires a 32-character hexadecimal Cloudflare account id on save", () => {
		expect(isCloudflareAccountId(ACCOUNT_ID)).toBe(true);
		expect(validateProviderCredential("cloudflare", JSON.stringify({ apiToken: "token", accountId: ACCOUNT_ID })).strict).toBe(true);
		for (const accountId of ["customer-account", "../../zones", `${ACCOUNT_ID}/ai/run`, ACCOUNT_ID.slice(1)]) {
			expect(isCloudflareAccountId(accountId)).toBe(false);
			expect(() => validateProviderCredential("cloudflare", JSON.stringify({ apiToken: "token", accountId })))
				.toThrow("32-character hexadecimal");
		}
	});
});
