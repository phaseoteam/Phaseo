import { createWebQueryClient } from "./queryClient";
import { fetchModelsPageData } from "./models";
import { fetchAuthenticatedPrivateModels } from "./privateModels";
import { webQueryKeys } from "./queryKeys";
import { fetchAuthenticatedProviderCatalogPreviews, type AuthenticatedProviderCatalogPreview } from "./providerCatalogPreviews";
import { dehydrate, QueryObserver } from "@tanstack/react-query";
import { getCatalogPricingSummariesCached } from "@/lib/fetchers/models/getCatalogPricingSummaries";
import { getModelProviderRuntimeStats } from "@/lib/fetchers/models/getModelProviderRuntimeStats";

jest.mock("@/lib/fetchers/internal/accountAuthClient", () => ({
	getBrowserAccessToken: jest.fn(async () => "fixture-token"),
}));

const scope = { userId: "user-a", workspaceId: "workspace-a" };
const preview = {
	model_id: "provider-a/draft", provider_slug: "provider-a", model_name: "Private Draft",
	provider_name: "Provider A", api_model_id: "draft", availability_status: "coming_soon",
} as AuthenticatedProviderCatalogPreview;

function publicPayload() {
	return {
		models: [{ model_id: "public/model", name: "Public Model", organisation_id: "public" }],
		facets: {
			statusCounts: { active: 1, coming_soon: 0, not_active: 0 },
			endpointOptions: [], inputModalityOptions: [], outputModalityOptions: [],
			featureOptions: [], tierOptions: [], supportedParameterOptions: [],
			providerOptions: [], regionOptions: [], creatorOptions: [], yearOptions: [],
		},
		pricing_complete: true, total: 1, limit: 2000, offset: 0,
	};
}

describe("public and authenticated catalogue boundaries", () => {
	const originalFetch = global.fetch;
	afterEach(() => { global.fetch = originalFetch; });

	function mockNetwork(accountStatus = 200) {
		const fetchMock = jest.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes("/api/_web/")) return Response.json(publicPayload());
			if (url.includes("previews")) return Response.json({ models: [] }, { status: accountStatus });
			return Response.json({
				private_catalogue: accountStatus === 200,
				models: accountStatus === 200 ? [{ model_id: "workspace-a/private", name: "Private Model" }] : [],
			}, { status: accountStatus });
		});
		global.fetch = fetchMock;
		return fetchMock;
	}

	it("makes only credential-free public requests for signed-out catalogue loads", async () => {
		const network = mockNetwork();
		const result = await fetchModelsPageData("/api/_web/models");
		expect(result.models.map((model) => model.model_id)).toEqual(["public/model"]);
		expect(network).toHaveBeenCalledTimes(1);
		expect(network).toHaveBeenCalledWith(expect.stringContaining("/api/_web/models"), expect.objectContaining({ credentials: "omit", cache: "no-store" }));
	});

	it("merges private models only for authenticated loads and pins their workspace", async () => {
		const network = mockNetwork();
		const result = await fetchModelsPageData("/api/_web/models", undefined, { accountQueryScope: scope });
		expect(result.models.map((model) => model.model_id)).toEqual(["workspace-a/private", "public/model"]);
		const privateCalls = network.mock.calls.filter(([url]) => String(url).includes("private-models"));
		expect(privateCalls).toHaveLength(2);
		for (const [url] of privateCalls) expect(String(url)).toContain("workspaceId=workspace-a");
	});

	it.each([401, 403])("keeps the public catalogue usable when private reads return %s", async (status) => {
		mockNetwork(status);
		const result = await fetchModelsPageData("/api/_web/models", undefined, { accountQueryScope: scope });
		expect(result.models.map((model) => model.model_id)).toEqual(["public/model"]);
	});

	it("propagates aborts instead of turning cancellation into an empty private catalogue", async () => {
		// Keep the exception in Jest's realm, matching Error/DOMException behavior in a browser.
		global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
		await expect(fetchAuthenticatedPrivateModels("page", { accessToken: "fixture-token" })).rejects.toMatchObject({ name: "AbortError" });
	});

	it("keeps SSR access tokens out of dehydrated catalogue state", async () => {
		const network = mockNetwork();
		const cache = createWebQueryClient();
		const token = "SSR-SECRET-SENTINEL";
		try {
			await cache.prefetchQuery({
				queryKey: webQueryKeys.account.catalogue({ scope, catalogueVersion: "v1", previewCacheScope: "public" }),
				queryFn: ({ signal }) => fetchModelsPageData("/api/_web/models", [], {
					accountQueryScope: scope, accessToken: token, signal, fetchProviderPreviews: false,
				}),
			});
			expect(network).toHaveBeenCalledWith(expect.stringContaining("private-models"), expect.objectContaining({
				headers: expect.objectContaining({ Authorization: `Bearer ${token}` }), cache: "no-store",
			}));
			const serialized = JSON.stringify(dehydrate(cache));
			expect(serialized).toContain("workspace-a/private");
			expect(serialized).not.toContain(token);
		} finally { cache.clear(); }
	});

	it("omits cookies on public pricing and provider-health requests too", async () => {
		const signal = new AbortController().signal;
		const network = jest.fn(async () => Response.json({ rules: [], rows: [] }));
		global.fetch = network;
		await Promise.all([
			getCatalogPricingSummariesCached(signal),
			getModelProviderRuntimeStats({ modelId: "public/model", providerIds: ["provider"], modelAliases: [], signal }),
		]);
		expect(network).toHaveBeenCalledTimes(2);
		for (const call of (network as jest.Mock).mock.calls) {
			expect(call[1].signal).toBe(signal);
			expect(call[1].cache).toBe("no-store");
			expect(call[1].credentials).toBe("omit");
		}
	});

	it("drops an SSR preview after access is revoked and the catalogue is refetched", async () => {
		mockNetwork(403);
		const cache = createWebQueryClient();
		const queryKey = webQueryKeys.account.catalogue({ scope, catalogueVersion: "v1", previewCacheScope: "draft" });
		try {
			const result = await cache.fetchQuery({
				queryKey,
				queryFn: () => fetchModelsPageData("/api/_web/models", [preview], { accountQueryScope: scope }),
			});
			expect(result.models.map((model) => model.model_id)).not.toContain(preview.model_id);
		} finally { cache.clear(); }
	});

	it("retains every endpoint row for a private model in table view", async () => {
		global.fetch = jest.fn(async () => Response.json({ private_catalogue: true, models: [
			{ id: "row-chat", modelId: "workspace-a/private", endpoint: "chat.completions" },
			{ id: "row-messages", modelId: "workspace-a/private", endpoint: "messages" },
			{ id: "row-responses", modelId: "workspace-a/private", endpoint: "responses" },
		] }));
		const result = await fetchAuthenticatedPrivateModels<{ endpoint: string }>("table", { accessToken: "fixture-token", workspaceId: scope.workspaceId });
		expect(result.map((row) => row.endpoint)).toEqual(["chat.completions", "messages", "responses"]);
	});

	it.each([401, 403, 404])("removes a detail preview seed when reauthorization returns %s", async (status) => {
		global.fetch = jest.fn(async () => Response.json({ error: "Denied" }, { status }));
		const cache = createWebQueryClient();
		const queryKey = webQueryKeys.account.providerPreviews({ scope });
		const observer = new QueryObserver(cache, {
			queryKey,
			queryFn: ({ signal }) => fetchAuthenticatedProviderCatalogPreviews(undefined, true, { signal }),
			placeholderData: [preview],
		});
		try {
			expect(observer.getCurrentResult().data).toEqual([preview]);
			expect(cache.getQueryData(queryKey)).toBeUndefined();
			const result = await observer.refetch();
			expect(result.data).toEqual([]);
			expect(result.isError).toBe(false);
			expect(cache.getQueryData(queryKey)).toEqual([]);
		} finally { observer.destroy(); cache.clear(); }
	});
});
