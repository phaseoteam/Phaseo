import { mergeAdminSearchModels } from "./Search.adminModels";
import { addRecentItem, togglePinnedItem } from "./Search.storage";
import type { SearchData } from "@/lib/fetchers/search/types";
import type { ModelsPageModel } from "@/components/(data)/models/Models/modelsDisplay.types";

const publicData: SearchData = {
	models: [], organisations: [], benchmarks: [], apiProviders: [], subscriptionPlans: [], countries: [],
};
const internal = { model_id: "example/internal", name: "Internal fixture", organisation_id: "example", organisation_name: "Example" } as ModelsPageModel;

describe("admin model search overlay", () => {
	it("leaves the shared public payload unchanged", () => {
		const result = mergeAdminSearchModels(publicData, [internal])!;
		expect(publicData.models).toEqual([]);
		expect(result.models[0]).toMatchObject({ href: "/models/example/internal", persistable: false });
	});
	it("preserves public results when the private source is empty or unavailable", () => {
		expect(mergeAdminSearchModels(publicData, [])).toBe(publicData);
		expect(mergeAdminSearchModels(undefined, [internal])).toBeUndefined();
	});
	it("does not duplicate a publicly released model", () => {
		const released = mergeAdminSearchModels(publicData, [internal])!;
		expect(mergeAdminSearchModels(released, [internal])!.models).toHaveLength(1);
	});
	it("never saves internal results in recent or pinned items", () => {
		const item = mergeAdminSearchModels(publicData, [internal])!.models[0]!;
		expect(addRecentItem([], item)).toEqual([]);
		expect(togglePinnedItem([], item)).toEqual([]);
	});
});
