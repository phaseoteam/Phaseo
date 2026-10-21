// The License filter has two levels: Permissive / Restricted / Proprietary,
// and the specific licences under each. Picking a group matches every licence
// in it, including ones that appear later; picking a licence matches just that
// licence. The Weights filter (Open / Closed) is derived from the same licence.

export type LicenseGroup = "permissive" | "restricted" | "proprietary";

export const LICENSE_GROUPS: readonly LicenseGroup[] = ["permissive", "restricted", "proprietary"];

// Use, modify and ship commercially with attribution only.
const PERMISSIVE_LICENSES = new Set([
	"apache 2.0",
	"mit",
	"bsd-2-clause",
	"bsd-3-clause",
	"cc0 1.0",
	"cc by 4.0",
	"openmdw-1.1",
]);

// No downloadable weights.
const PROPRIETARY_LICENSES = new Set(["proprietary"]);

// Everything else ships weights under conditions: community licences with use
// policies or user caps (Llama, Gemma, Qwen, DeepSeek, NVIDIA Open Model,
// OpenRAIL), non-commercial and research licences, and rows only known to be
// "Open weights".

export type LicenseSelection = {
	groups: string[];
	licenses: string[];
};

export function licenseGroup(license: string | null | undefined): LicenseGroup | null {
	const value = String(license ?? "").trim().toLowerCase();
	if (!value) return null;
	if (PROPRIETARY_LICENSES.has(value)) return "proprietary";
	return PERMISSIVE_LICENSES.has(value) ? "permissive" : "restricted";
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

export type ModelWeights = "open" | "closed";

export const MODEL_WEIGHTS: readonly ModelWeights[] = ["open", "closed"];

// Models without a licence are unknown, so they match neither option.
export function modelWeights(license: string | null | undefined): ModelWeights | null {
	const group = licenseGroup(license);
	if (!group) return null;
	return group === "proprietary" ? "closed" : "open";
}

export function parseModelWeights(values: string[]): ModelWeights[] {
	return MODEL_WEIGHTS.filter((value) => values.includes(value));
}

export function matchesModelWeights(
	license: string | null | undefined,
	selected: string[],
): boolean {
	if (selected.length === 0) return true;
	const weights = modelWeights(license);
	return weights !== null && selected.includes(weights);
}
