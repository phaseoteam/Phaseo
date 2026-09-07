const mockFetchPublicWebApi = jest.fn();
jest.mock("@/lib/web-api/client", () => ({
	fetchOptionalPublicWebApi: jest.fn(),
	fetchPublicWebApi: (...args: unknown[]) => mockFetchPublicWebApi(...args),
}));

import { fetchFrontendFamilies, fetchFrontendAPIProviders } from "@/lib/fetchers/frontend/fetchPublicCatalog";

test("keeps regional routes distinct in the provider catalogue used by cards, comparison and BYOK", async () => {
	mockFetchPublicWebApi.mockResolvedValueOnce({ providers: [
		{ api_provider_id: "openai", api_provider_name: "OpenAI" },
		{ api_provider_id: "openai-eu", api_provider_name: "OpenAI" },
	] });
	expect(await fetchFrontendAPIProviders()).toEqual([
		{ api_provider_id: "openai", api_provider_name: "OpenAI" },
		{ api_provider_id: "openai-eu", api_provider_name: "OpenAI (EU)" },
	]);
});

describe("fetchFrontendFamilies", () => {
	beforeEach(() => {
		mockFetchPublicWebApi.mockReset();
	});

	it("enriches legacy family payloads with organisation display names", async () => {
		mockFetchPublicWebApi.mockImplementation(async (path: string) => {
			if (path === "/api/_web/families") {
				return {
					families: [{
						family_id: "openai/gpt",
						family_name: "GPT",
						organisation_id: "openai",
					}],
				};
			}
			return {
				organisations: [{
					organisation_id: "openai",
					organisation_name: "OpenAI",
					country_code: "US",
					colour: null,
				}],
			};
		});

		await expect(fetchFrontendFamilies()).resolves.toMatchObject([{
			family_id: "openai/gpt",
			organisation_name: "OpenAI",
		}]);
		expect(mockFetchPublicWebApi).toHaveBeenCalledTimes(2);
	});

	it("uses names already included in the family payload", async () => {
		mockFetchPublicWebApi.mockResolvedValue({
			families: [{
				family_id: "openai/gpt",
				family_name: "GPT",
				organisation_id: "openai",
				organisation_name: "OpenAI",
			}],
		});

		await expect(fetchFrontendFamilies()).resolves.toMatchObject([{
			organisation_name: "OpenAI",
		}]);
		expect(mockFetchPublicWebApi).toHaveBeenCalledTimes(1);
	});
});
