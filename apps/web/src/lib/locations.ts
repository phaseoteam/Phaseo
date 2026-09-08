const SUBDIVISION_NAMES: Record<string, string> = {
	"CA-ON": "Ontario",
	"CN-BJ": "Beijing",
	"CN-GD": "Guangdong",
	"CN-SH": "Shanghai",
	"DE-BW": "Baden-Württemberg",
	"FR-IDF": "Île-de-France",
	"GB-ENG": "England",
	"IE-D": "Dublin",
	"IL-TA": "Tel Aviv District",
	"JP-13": "Tokyo",
	"KR-11": "Seoul",
	"NL-GE": "Gelderland",
	"SE-AB": "Stockholm County",
	"US-CA": "California",
	"US-FL": "Florida",
	"US-MA": "Massachusetts",
	"US-MO": "Missouri",
	"US-NY": "New York",
	"US-WA": "Washington",
};

function countryName(code: string | null | undefined): string | null {
	const normalized = code?.trim().toUpperCase();
	if (!normalized || normalized === "XX") return null;
	try {
		return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ?? normalized;
	} catch {
		return normalized;
	}
}

export function formatLocation(
	countryCode: string | null | undefined,
	subdivisionCode: string | null | undefined,
): string | null {
	const normalizedSubdivision = subdivisionCode?.trim().toUpperCase() || null;
	const subdivisionName = normalizedSubdivision
		? SUBDIVISION_NAMES[normalizedSubdivision] ?? normalizedSubdivision
		: null;
	const resolvedCountryName = countryName(countryCode);

	return [subdivisionName, resolvedCountryName].filter(Boolean).join(", ") || null;
}

export function formatCountryName(code: string | null | undefined): string | null {
	return countryName(code);
}
