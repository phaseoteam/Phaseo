import type {
	ModelsFilterFacets,
	ModelsPageModel,
} from "@/components/(data)/models/Models/modelsDisplay.types";
import { fetchModelsPageData } from "./models";

const facets: ModelsFilterFacets = {
	statusCounts: { active: 2, coming_soon: 0, not_active: 0 },
	endpointOptions: [],
	inputModalityOptions: [],
	outputModalityOptions: [],
	featureOptions: [],
	tierOptions: [],
	supportedParameterOptions: [],
	providerOptions: [],
	regionOptions: [],
	creatorOptions: [],
	yearOptions: [],
};

function model(modelId: string): ModelsPageModel {
	return {
		model_id: modelId,
		name: modelId,
		organisation_id: "test",
	} as ModelsPageModel;
}

describe("fetchModelsPageData", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("combines every API page while retaining the catalogue facets", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						models: [model("one")],
						facets,
						pricing_complete: true,
						total: 2,
						limit: 1,
						offset: 0,
					}),
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						models: [model("two")],
						total: 2,
						limit: 1,
						offset: 1,
					}),
				),
			);
		global.fetch = fetchMock;

		const result = await fetchModelsPageData(
			"/api/_web/models?limit=1&offset=0&shape=page&projection=5",
		);

		expect(result.models.map((entry) => entry.model_id)).toEqual(["one", "two"]);
		expect(result.facets).toEqual(facets);
		expect(fetchMock.mock.calls[1]?.[0]).toContain("offset=1");
	});

	it("rejects responses that cannot power the filters", async () => {
		global.fetch = jest.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					models: [],
					pricing_complete: true,
					total: 0,
					limit: 2_000,
					offset: 0,
				}),
			),
		);

		await expect(fetchModelsPageData("/api/_web/models?limit=2000"))
			.rejects.toThrow("did not include filter facets");
	});
});
