const REGION_DISPLAY_NAMES = new Intl.DisplayNames(["en"], {
	type: "region",
});

export function formatCountryName(iso: string) {
	if (!iso) return "Unknown";
	const normalized = iso.toUpperCase();
	const displayName = REGION_DISPLAY_NAMES.of(normalized);
	return displayName ?? normalized;
}
