import {
	licenseGroup,
	matchesLicenseSelection,
	matchesModelWeights,
	modelWeights,
	parseLicenseGroups,
	parseModelWeights,
	toggleLicense,
	toggleLicenseGroup,
} from "./licenseFilter";

const ALL = ["Proprietary", "Apache 2.0", "MIT", "Llama 3 Community License"];
const none = { groups: [], licenses: [] };

describe("licenseGroup", () => {
	it("sorts licences into Permissive, Restricted and Proprietary", () => {
		expect(licenseGroup("Proprietary")).toBe("proprietary");
		expect(licenseGroup("Apache 2.0")).toBe("permissive");
		expect(licenseGroup("MIT")).toBe("permissive");
		expect(licenseGroup("CC BY 4.0")).toBe("permissive");
		expect(licenseGroup("Llama 3.1 Community License")).toBe("restricted");
		expect(licenseGroup("CC BY-NC 4.0")).toBe("restricted");
		expect(licenseGroup("Open weights")).toBe("restricted");
		expect(licenseGroup("")).toBeNull();
		expect(licenseGroup(undefined)).toBeNull();
	});

	it("ignores unknown group names from the URL", () => {
		expect(parseLicenseGroups(["proprietary", "nope", "open", "permissive"])).toEqual([
			"permissive",
			"proprietary",
		]);
	});
});

describe("matchesLicenseSelection", () => {
	it("matches everything, including unlicensed models, when nothing is selected", () => {
		expect(matchesLicenseSelection(undefined, none)).toBe(true);
	});

	it("matches a whole group or a single licence", () => {
		const permissive = { groups: ["permissive"], licenses: [] };
		expect(matchesLicenseSelection("MIT", permissive)).toBe(true);
		expect(matchesLicenseSelection("Proprietary", permissive)).toBe(false);
		expect(matchesLicenseSelection(undefined, permissive)).toBe(false);

		const mixed = { groups: ["proprietary"], licenses: ["MIT"] };
		expect(matchesLicenseSelection("Proprietary", mixed)).toBe(true);
		expect(matchesLicenseSelection("MIT", mixed)).toBe(true);
		expect(matchesLicenseSelection("Apache 2.0", mixed)).toBe(false);
	});
});

describe("toggling", () => {
	it("selecting a group drops the licences already picked inside it", () => {
		expect(
			toggleLicenseGroup({ groups: [], licenses: ["MIT", "Proprietary"] }, "permissive"),
		).toEqual({ groups: ["permissive"], licenses: ["Proprietary"] });
	});

	it("unticking one licence in a selected group keeps the others", () => {
		expect(toggleLicense({ groups: ["permissive"], licenses: [] }, "MIT", ALL)).toEqual({
			groups: [],
			licenses: ["Apache 2.0"],
		});
	});

	it("ticking the last licence in a group selects the group", () => {
		expect(toggleLicense({ groups: [], licenses: ["Apache 2.0"] }, "MIT", ALL)).toEqual({
			groups: ["permissive"],
			licenses: [],
		});
		expect(toggleLicense(none, "Proprietary", ALL)).toEqual({
			groups: ["proprietary"],
			licenses: [],
		});
	});

	it("toggles a single licence off again", () => {
		expect(toggleLicense({ groups: [], licenses: ["MIT"] }, "MIT", ALL)).toEqual(none);
	});
});

describe("weights", () => {
	it("treats proprietary licences as closed and every other licence as open", () => {
		expect(modelWeights("Proprietary")).toBe("closed");
		expect(modelWeights("Apache 2.0")).toBe("open");
		expect(modelWeights("CC BY-NC 4.0")).toBe("open");
		expect(modelWeights(null)).toBeNull();
		expect(parseModelWeights(["closed", "x", "open"])).toEqual(["open", "closed"]);
	});

	it("matches everything when nothing is selected and skips unknown licences otherwise", () => {
		expect(matchesModelWeights(undefined, [])).toBe(true);
		expect(matchesModelWeights(undefined, ["open"])).toBe(false);
		expect(matchesModelWeights("MIT", ["open"])).toBe(true);
		expect(matchesModelWeights("Proprietary", ["open"])).toBe(false);
		expect(matchesModelWeights("Proprietary", ["open", "closed"])).toBe(true);
	});
});
