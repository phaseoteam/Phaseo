import {
	licenseGroup,
	matchesLicenseSelection,
	parseLicenseGroups,
	toggleLicense,
	toggleLicenseGroup,
} from "./licenseFilter";

const ALL = ["Proprietary", "Apache 2.0", "MIT", "Llama 3 Community License"];
const none = { groups: [], licenses: [] };

describe("licenseGroup", () => {
	it("puts proprietary licences in Closed and the rest in Open", () => {
		expect(licenseGroup("Proprietary")).toBe("closed");
		expect(licenseGroup("Riva license")).toBe("closed");
		expect(licenseGroup("Apache 2.0")).toBe("open");
		expect(licenseGroup("CC-BY-NC")).toBe("open");
		expect(licenseGroup("")).toBeNull();
		expect(licenseGroup(undefined)).toBeNull();
	});

	it("ignores unknown group names from the URL", () => {
		expect(parseLicenseGroups(["closed", "nope", "open"])).toEqual(["open", "closed"]);
	});
});

describe("matchesLicenseSelection", () => {
	it("matches everything, including unlicensed models, when nothing is selected", () => {
		expect(matchesLicenseSelection(undefined, none)).toBe(true);
	});

	it("matches a whole group or a single licence", () => {
		const open = { groups: ["open"], licenses: [] };
		expect(matchesLicenseSelection("MIT", open)).toBe(true);
		expect(matchesLicenseSelection("Proprietary", open)).toBe(false);
		expect(matchesLicenseSelection(undefined, open)).toBe(false);

		const mixed = { groups: ["closed"], licenses: ["MIT"] };
		expect(matchesLicenseSelection("Proprietary", mixed)).toBe(true);
		expect(matchesLicenseSelection("MIT", mixed)).toBe(true);
		expect(matchesLicenseSelection("Apache 2.0", mixed)).toBe(false);
	});
});

describe("toggling", () => {
	it("selecting a group drops the licences already picked inside it", () => {
		expect(toggleLicenseGroup({ groups: [], licenses: ["MIT", "Proprietary"] }, "open")).toEqual({
			groups: ["open"],
			licenses: ["Proprietary"],
		});
	});

	it("unticking one licence in a selected group keeps the others", () => {
		expect(toggleLicense({ groups: ["open"], licenses: [] }, "MIT", ALL)).toEqual({
			groups: [],
			licenses: ["Apache 2.0", "Llama 3 Community License"],
		});
	});

	it("ticking the last licence in a group selects the group", () => {
		expect(
			toggleLicense({ groups: [], licenses: ["Apache 2.0", "MIT"] }, "Llama 3 Community License", ALL),
		).toEqual({ groups: ["open"], licenses: [] });
		expect(toggleLicense(none, "Proprietary", ALL)).toEqual({ groups: ["closed"], licenses: [] });
	});

	it("toggles a single licence off again", () => {
		expect(toggleLicense({ groups: [], licenses: ["MIT"] }, "MIT", ALL)).toEqual(none);
	});
});
