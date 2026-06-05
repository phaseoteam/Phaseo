import {
	groupProviderIndexCards,
	type APIProviderIndexVariant,
} from "./providerIndexGrouping";

function buildVariant(
	overrides: Partial<APIProviderIndexVariant>,
): APIProviderIndexVariant {
	return {
		api_provider_id: "provider",
		api_provider_name: "Provider",
		colour: null,
		country_code: "US",
		provider_family_id: "provider",
		offer_label: null,
		offer_scope: "global",
		total_model_ids: [],
		active_model_ids: [],
		free_model_ids: [],
		total_daily_requests: 0,
		total_daily_tokens: 0,
		total_monthly_tokens: 0,
		modality_model_ids: {
			text: { input: [], output: [] },
			image: { input: [], output: [] },
			video: { input: [], output: [] },
			audio: { input: [], output: [] },
			moderation: { input: [], output: [] },
			embedding: { input: [], output: [] },
		},
		...overrides,
	};
}

describe("groupProviderIndexCards", () => {
	test("collapses regional provider variants into the base provider", () => {
		const cards = groupProviderIndexCards([
			buildVariant({
				api_provider_id: "google-vertex",
				api_provider_name: "Google Vertex",
				provider_family_id: "google-vertex",
				total_model_ids: ["gemini-pro", "gemini-flash"],
				active_model_ids: ["gemini-pro"],
				free_model_ids: ["gemini-flash"],
				total_daily_requests: 10,
				total_daily_tokens: 100,
				total_monthly_tokens: 1_000,
				modality_model_ids: {
					text: {
						input: ["gemini-pro", "gemini-flash"],
						output: ["gemini-pro", "gemini-flash"],
					},
					image: { input: [], output: [] },
					video: { input: [], output: [] },
					audio: { input: [], output: [] },
					moderation: { input: [], output: [] },
					embedding: { input: [], output: [] },
				},
			}),
			buildVariant({
				api_provider_id: "google-vertex-eu",
				api_provider_name: "Google Vertex",
				provider_family_id: "google-vertex",
				offer_label: "EU",
				offer_scope: "regional",
				total_model_ids: ["gemini-pro"],
				active_model_ids: ["gemini-pro"],
				free_model_ids: [],
				total_daily_requests: 5,
				total_daily_tokens: 40,
				total_monthly_tokens: 500,
				modality_model_ids: {
					text: {
						input: ["gemini-pro"],
						output: ["gemini-pro"],
					},
					image: { input: [], output: [] },
					video: { input: [], output: [] },
					audio: { input: [], output: [] },
					moderation: { input: [], output: [] },
					embedding: { input: [], output: [] },
				},
			}),
		]);

		expect(cards).toHaveLength(1);
		expect(cards[0]).toMatchObject({
			api_provider_id: "google-vertex",
			api_provider_name: "Google Vertex",
			total_models: 2,
			active_models: 1,
			free_models: 1,
			total_daily_tokens: 140,
			total_monthly_tokens: 1500,
		});
		expect(cards[0].modality_support.text).toEqual({ input: 2, output: 2 });
		expect(cards[0].daily_share_pct).toBeCloseTo(100);
	});

	test("keeps specialized provider offers separate while folding their regional variants", () => {
		const cards = groupProviderIndexCards([
			buildVariant({
				api_provider_id: "anthropic",
				api_provider_name: "Anthropic",
				provider_family_id: "anthropic",
				total_model_ids: ["opus"],
				active_model_ids: ["opus"],
				total_daily_requests: 10,
				total_daily_tokens: 100,
			}),
			buildVariant({
				api_provider_id: "anthropic-us",
				api_provider_name: "Anthropic",
				provider_family_id: "anthropic",
				offer_label: "US",
				offer_scope: "regional",
				total_model_ids: ["opus"],
				active_model_ids: ["opus"],
				total_daily_requests: 5,
				total_daily_tokens: 50,
			}),
			buildVariant({
				api_provider_id: "anthropic-aws",
				api_provider_name: "Anthropic",
				provider_family_id: "anthropic",
				offer_label: "AWS",
				offer_scope: "specialized",
				total_model_ids: ["opus"],
				active_model_ids: ["opus"],
				total_daily_requests: 8,
				total_daily_tokens: 80,
			}),
			buildVariant({
				api_provider_id: "anthropic-aws-us",
				api_provider_name: "Anthropic",
				provider_family_id: "anthropic",
				offer_label: "AWS US",
				offer_scope: "regional",
				total_model_ids: ["opus"],
				active_model_ids: ["opus"],
				total_daily_requests: 2,
				total_daily_tokens: 20,
			}),
		]);

		expect(cards.map((card) => card.api_provider_id).sort()).toEqual([
			"anthropic",
			"anthropic-aws",
		]);

		const byId = new Map(cards.map((card) => [card.api_provider_id, card]));
		expect(byId.get("anthropic")).toMatchObject({
			api_provider_name: "Anthropic",
			total_daily_tokens: 150,
		});
		expect(byId.get("anthropic-aws")).toMatchObject({
			api_provider_name: "Anthropic on AWS",
			total_daily_tokens: 100,
		});
	});
});
