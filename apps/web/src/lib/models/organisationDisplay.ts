const ORGANISATION_NAME_OVERRIDES: Record<string, string> = {
	ai21: "AI21",
	ibm: "IBM",
	lg: "LG",
	openai: "OpenAI",
	"spacex-ai": "SpaceXAI",
	"z-ai": "z.AI",
};

export function normalizeOrganisationDisplayName(
	rawName: unknown,
	organisationId: unknown,
): string | null {
	const id = String(organisationId ?? "").trim().toLowerCase();
	const name = String(rawName ?? "").trim();
	const override = ORGANISATION_NAME_OVERRIDES[id];

	if (!name) return override ?? null;

	const normalizedNameKey = name.toLowerCase().replace(/\s+/g, "-");
	if (override && (normalizedNameKey === id || name === name.toLowerCase())) {
		return override;
	}

	return name;
}
