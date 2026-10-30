import {
	addFamilyRecencyFallbacks,
	sortFamiliesByRecentAddition,
} from "@/lib/fetchers/families/sortFamilies";
import type { FamilyCard } from "@/lib/fetchers/families/types";

const family = (
	family_name: string,
	created_at: string | null,
): FamilyCard => ({
	family_id: `test/${family_name.toLowerCase()}`,
	family_name,
	organisation_id: "test",
	organisation_name: "Test",
	created_at,
});

describe("sortFamiliesByRecentAddition", () => {
	it("places the most recently added families first", () => {
		const families = [
			family("Older", "2026-05-01T00:00:00.000Z"),
			family("Newest", "2026-07-01T00:00:00.000Z"),
			family("Middle", "2026-06-01T00:00:00.000Z"),
		];

		expect(
			sortFamiliesByRecentAddition(families).map(
				(candidate) => candidate.family_name,
			),
		).toEqual(["Newest", "Middle", "Older"]);
	});

	it("keeps undated families deterministic at the end", () => {
		const families = [family("Zulu", null), family("Alpha", null)];

		expect(
			sortFamiliesByRecentAddition(families).map(
				(candidate) => candidate.family_name,
			),
		).toEqual(["Alpha", "Zulu"]);
	});

	it("falls back to the newest family member when the API omits created_at", async () => {
		const families = [family("Older family", null), family("Newer family", null)];
		const enriched = await addFamilyRecencyFallbacks(
			families,
			async (familyId) => ({
				family_id: familyId,
				family_name: familyId,
				models: [
					{
						model_id: `${familyId}/model`,
						name: "Model",
						organisation_id: "test",
						release_date: familyId.includes("newer")
							? "2026-07-01T00:00:00.000Z"
							: "2026-06-01T00:00:00.000Z",
					},
				],
			}),
		);

		expect(
			sortFamiliesByRecentAddition(enriched).map(
				(candidate) => candidate.family_name,
			),
		).toEqual(["Newer family", "Older family"]);
	});
});
