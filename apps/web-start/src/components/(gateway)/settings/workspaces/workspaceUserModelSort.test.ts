import { sortWorkspaceUserModels } from "./workspaceUserModelSort";
import { nextTableSort } from "../../usage/SortableTableHead";

const rows = [{ modelId: "a", requests: 20, spendUsd: 2 }, { modelId: "b", requests: 5, spendUsd: 10 }, { modelId: "c", requests: 5, spendUsd: 3 }];
const metadata = new Map([["a", { modelName: "Zulu", organisationId: "lab", organisationName: "Lab" }], ["b", { modelName: "Alpha", organisationId: "lab", organisationName: "Lab" }]]);

it("cycles descending, ascending and default order like usage tables", () => {
	const desc = nextTableSort(null, "requests");
	expect(desc).toEqual({ key: "requests", direction: "desc" });
	const asc = nextTableSort(desc, "requests");
	expect(asc).toEqual({ key: "requests", direction: "asc" });
	expect(nextTableSort(asc, "requests")).toBeNull();
	expect(nextTableSort(asc, "model")).toEqual({ key: "model", direction: "desc" });
});

it("sorts numeric spend and request values without mutating source rows", () => {
	expect(sortWorkspaceUserModels(rows, metadata, { key: "spendUsd", direction: "desc" }, "en-GB").map(row => row.modelId)).toEqual(["b", "c", "a"]);
	expect(sortWorkspaceUserModels(rows, metadata, { key: "requests", direction: "asc" }, "en-GB").map(row => row.modelId)).toEqual(["b", "c", "a"]);
	expect(rows.map(row => row.modelId)).toEqual(["a", "b", "c"]);
	expect(sortWorkspaceUserModels(rows, metadata, null, "en-GB")).toBe(rows);
});

it("sorts displayed model names rather than raw identifiers", () => {
	expect(sortWorkspaceUserModels(rows.slice(0, 2), metadata, { key: "model", direction: "asc" }, "en-GB").map(row => row.modelId)).toEqual(["b", "a"]);
});
