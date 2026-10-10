import { fetchFrontendGatewayModels, fetchFrontendGatewayModelAliases } from "./fetchFrontendGatewayModels";
import { fetchPublicWebApi } from "@/lib/web-api/client";

jest.mock("@/lib/web-api/client", () => ({ fetchPublicWebApi: jest.fn() }));

test.each([fetchFrontendGatewayModels, fetchFrontendGatewayModelAliases])(
    "%p preserves specialized names and distinguishes regional routes",
    async (fetchModels) => {
        const models = [
            { providerId: "minimax-lightning", providerName: "MiniMax Lightning", providerOfferLabel: "highspeed", providerOfferScope: "specialized" },
            { providerId: "openai-eu", providerName: "OpenAI", providerOfferLabel: "EU", providerOfferScope: "regional" },
        ];
        jest.mocked(fetchPublicWebApi).mockResolvedValueOnce({ models, aliases: models });
        expect((await fetchModels()).map((model) => model.providerName)).toEqual(["MiniMax Lightning", "OpenAI (EU)"]);
    },
);

it("allows same-origin deployment protection without dropping model route or capability data", async () => {
	const model = { modelId: "test/model", providerId: "openai", providerName: "OpenAI", capabilities: ["text.generate"], capabilityParamsById: { "text.generate": [{ param_id: "temperature", provider_min: 0, provider_max: 2 }] } };
	jest.mocked(fetchPublicWebApi).mockResolvedValue({ models: [model] });
	expect(await fetchFrontendGatewayModels({ credentials: "same-origin" })).toEqual([model]);
	expect(fetchPublicWebApi).toHaveBeenCalledWith("/api/_web/gateway/models?available_only=true", { credentials: "same-origin" });
});
