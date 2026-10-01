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
