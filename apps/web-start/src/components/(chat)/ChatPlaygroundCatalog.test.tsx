import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ChatPlaygroundCatalog from "./ChatPlaygroundCatalog";
import ChatPlayground from "./ChatPlayground";
import { webQueryKeys } from "@/lib/query/queryKeys";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("./ChatPlayground", () => ({ __esModule: true, default: jest.fn(() => <div>playground</div>) }));
jest.mock("./ChatPlaygroundShell", () => ({ __esModule: true, default: () => <div>loading catalogue</div> }));
jest.mock("@/lib/fetchers/frontend/fetchFrontendGatewayModels", () => ({ fetchFrontendGatewayModels: jest.fn() }));

const model = (modelId: string, providerId = "public"): GatewaySupportedModel => ({
	modelId, selectorModelId: modelId, internalModelId: modelId, providerId, capabilities: ["text.generate"],
	effectiveFrom: null, effectiveTo: null, providerName: providerId, providerFamilyId: null, providerOfferLabel: null,
	providerOfferScope: null, providerPromptTrainingPolicy: null, modelName: modelId, modelStatus: "active",
	organisationId: "test", organisationName: "Test", previousModelId: null, releaseDate: null, announcementDate: null, isAvailable: true,
});

describe("browser-loaded chat catalogue", () => {
	beforeEach(() => jest.clearAllMocks());
	it("keeps the public catalogue out of the server response", () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const html = renderToStaticMarkup(<QueryClientProvider client={client}><ChatPlaygroundCatalog previewModels={[]} internalModels={[]} effectivePolicy={null} /></QueryClientProvider>);
		expect(html).toContain("loading catalogue");
		expect(ChatPlayground).not.toHaveBeenCalled();
		expect(fetchFrontendGatewayModels).not.toHaveBeenCalled();
		client.clear();
	});
	it("preserves public routes, private previews, internal models, URL inputs and workspace blocks after loading", () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(webQueryKeys.public.chatGatewayModels(), [model("test/public")]);
		renderToStaticMarkup(<QueryClientProvider client={client}><ChatPlaygroundCatalog
			previewModels={[model("test/public", "preview"), model("test/private", "preview")]}
			internalModels={[{ ...model("test/internal", "internal"), isInternal: true }]}
			effectivePolicy={{ workspaceId: "workspace", guardrails: [], workspace: { provider: { mode: "blocklist", ids: ["public"] }, model: { mode: "none", ids: [] } } }}
			modelParam="test/private" promptParam="draft prompt"
		/></QueryClientProvider>);
		const props = jest.mocked(ChatPlayground).mock.calls[0][0];
		expect(props.models.map((entry) => entry.modelId)).toEqual(["test/public", "test/private", "test/internal"]);
		expect(props.models[0].chatBlockedReasons).toEqual([expect.objectContaining({ source: "workspace" })]);
		expect(props.models[1].chatBlockedReasons).toEqual([]);
		expect(props.models[2].isInternal).toBe(true);
		expect(props.modelParam).toBe("test/private");
		expect(props.promptParam).toBe("draft prompt");
		client.clear();
	});
});
