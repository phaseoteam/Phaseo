import type { ModelCard } from "@/lib/fetchers/models/getAllModels";
import {
	COUNTRY_MODELS_PREVIEW_PER_ORGANISATION,
	groupCountryModels,
	previewCountryModels,
} from "./countryModelGroups";

const model = (id: string, organisation: string | null, timestamp: number) =>
	({
		model_id: id,
		name: id,
		organisation_id: organisation,
		organisation_name: organisation ? organisation.toUpperCase() : null,
		primary_timestamp: timestamp,
	}) as unknown as ModelCard;

describe("groupCountryModels", () => {
	it("groups by organisation A–Z with the newest model first", () => {
		const groups = groupCountryModels(
			[model("b/old", "b", 1), model("a/one", "a", 5), model("b/new", "b", 9), model("x/none", null, 3)],
			"Unknown",
		);
		expect(groups.map((group) => [group.id, group.name, group.models.map((m) => m.model_id)])).toEqual([
			["a", "A", ["a/one"]],
			["b", "B", ["b/new", "b/old"]],
			["unknown", "Unknown", ["x/none"]],
		]);
	});
});

describe("previewCountryModels", () => {
	it("keeps the first models of each organisation in display order", () => {
		const many = Array.from({ length: 9 }, (_, i) => model(`b/m${i}`, "b", i));
		const groups = groupCountryModels([...many, model("a/one", "a", 1)], "Unknown");
		const preview = previewCountryModels(groups);
		expect(preview).toHaveLength(1 + COUNTRY_MODELS_PREVIEW_PER_ORGANISATION);
		expect(preview.map((m) => m.model_id).slice(0, 3)).toEqual(["a/one", "b/m8", "b/m7"]);
	});
});
