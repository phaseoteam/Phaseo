// The License filter has two levels: Open / Closed, and the specific licences
// under each. Picking a group matches every licence in it, including ones that
// appear later; picking a licence matches just that licence.

export type LicenseGroup = "open" | "closed";

export const LICENSE_GROUPS: readonly LicenseGroup[] = ["open", "closed"];

// Licences that don't let you download the weights. Everything else in the
// catalogue (Apache, MIT, community and research licences) ships weights.
const CLOSED_LICENSES = new Set(["proprietary", "riva license"]);

export type LicenseSelection = {
	groups: string[];
	licenses: string[];
};

export function licenseGroup(license: string | null | undefined): LicenseGroup | null {
	const value = String(license ?? "").trim();
	if (!value) return null;
	return CLOSED_LICENSES.has(value.toLowerCase()) ? "closed" : "open";
}

export function parseLicenseGroups(values: string[]): LicenseGroup[] {
	return LICENSE_GROUPS.filter((group) => values.includes(group));
}

export function hasLicenseSelection({ groups, licenses }: LicenseSelection): boolean {
	return groups.length > 0 || licenses.length > 0;
}

export function matchesLicenseSelection(
	license: string | null | undefined,
	selection: LicenseSelection,
): boolean {
	if (!hasLicenseSelection(selection)) return true;
	if (!license) return false;
	const group = licenseGroup(license);
	return (
		(group !== null && selection.groups.includes(group)) ||
		selection.licenses.includes(license)
	);
}

export function toggleLicenseGroup(
	selection: LicenseSelection,
	group: LicenseGroup,
): LicenseSelection {
	if (selection.groups.includes(group)) {
		return {
			groups: selection.groups.filter((value) => value !== group),
			licenses: selection.licenses,
		};
	}
	return {
		groups: [...selection.groups, group],
		licenses: selection.licenses.filter((value) => licenseGroup(value) !== group),
	};
}

// `allLicenses` is every licence the filter offers. Unticking one licence
// inside a selected group keeps the rest of that group ticked, and ticking the
// last unticked licence in a group selects the group itself.
export function toggleLicense(
	selection: LicenseSelection,
	license: string,
	allLicenses: string[],
): LicenseSelection {
	const group = licenseGroup(license);
	if (!group) return selection;
	const siblings = allLicenses.filter((value) => licenseGroup(value) === group);

	if (selection.groups.includes(group)) {
		return {
			groups: selection.groups.filter((value) => value !== group),
			licenses: [
				...selection.licenses,
				...siblings.filter(
					(value) => value !== license && !selection.licenses.includes(value),
				),
			],
		};
	}

	const licenses = selection.licenses.includes(license)
		? selection.licenses.filter((value) => value !== license)
		: [...selection.licenses, license];
	if (siblings.length > 0 && siblings.every((value) => licenses.includes(value))) {
		return {
			groups: [...selection.groups, group],
			licenses: licenses.filter((value) => licenseGroup(value) !== group),
		};
	}
	return { groups: selection.groups, licenses };
}
