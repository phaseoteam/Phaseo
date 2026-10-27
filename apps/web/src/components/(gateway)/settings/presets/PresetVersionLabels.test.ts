import { labelMovesFor, labelReference, normalizeLabelInput, versionName } from "./PresetVersionLabels";

jest.mock("@/app/(dashboard)/settings/presets/actions", () => ({}));

const versions = [
	{ id: "v3", version_number: 3, version_label: "v3", release_notes: null, visibility: "team", created_at: null, labels: ["staging"] },
	{ id: "v2", version_number: 2, version_label: "v2", release_notes: null, visibility: "team", created_at: null, labels: ["production"] },
	{ id: "s1", version_number: 4, version_label: null, release_notes: null, visibility: "team", created_at: null, labels: [] },
];
const labels = [
	{ label: "production", version_id: "v2", updated_at: null },
	{ label: "staging", version_id: "v3", updated_at: null },
];

describe("preset version labels", () => {
	it("accepts the labels the database accepts, lowercased", () => {
		expect(normalizeLabelInput(" Production ")).toBe("production");
		expect(normalizeLabelInput("canary_2-eu")).toBe("canary_2-eu");
		for (const bad of ["", "v2", "V10", "2fast", "has space", "a".repeat(33), "-x"]) expect(normalizeLabelInput(bad)).toBeNull();
	});

	it("names versions the way requests pin them", () => {
		expect(versionName(versions[0])).toBe("v3");
		expect(versionName(versions[2])).toBe("v4");
		expect(labelReference("@acme/support-triage", "production")).toBe("@acme/support-triage@production");
	});

	it("offers to move every label that points at another version, saying where it is now", () => {
		expect(labelMovesFor("v3", { versions, labels })).toEqual([{ label: "production", from: "v2" }]);
		// Rolling production back from v3 to v2 is one move.
		expect(labelMovesFor("v2", { versions, labels: [{ label: "production", version_id: "v3", updated_at: null }] })).toEqual([{ label: "production", from: "v3" }]);
		expect(labelMovesFor("s1", { versions, labels }).map((move) => move.label)).toEqual(["production", "staging"]);
	});
});
