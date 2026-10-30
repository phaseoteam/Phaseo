type RawModalities = string[] | string | null | undefined;

export interface ProviderModelModalitySource {
	input_modalities?: RawModalities;
	output_modalities?: RawModalities;
}

export interface CanonicalModelModalitySource {
	input_types?: RawModalities;
	output_types?: RawModalities;
	input_modalities?: RawModalities;
	output_modalities?: RawModalities;
}

function parseModalities(raw: RawModalities): string[] {
	if (Array.isArray(raw)) {
		return raw.map((value) => String(value ?? "").trim()).filter(Boolean);
	}
	if (typeof raw === "string") {
		const normalized = raw.trim();
		if (!normalized) return [];
		return normalized
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean);
	}
	return [];
}

export function resolveEffectiveProviderModalities(args: {
	providerModel: ProviderModelModalitySource;
	canonicalModel?: CanonicalModelModalitySource | null;
}): {
	inputModalities: string[];
	outputModalities: string[];
} {
	const providerInputModalities = parseModalities(
		args.providerModel.input_modalities,
	);
	const providerOutputModalities = parseModalities(
		args.providerModel.output_modalities,
	);

	const canonicalInputModalities = parseModalities(
		args.canonicalModel?.input_types ?? args.canonicalModel?.input_modalities,
	);
	const canonicalOutputModalities = parseModalities(
		args.canonicalModel?.output_types ?? args.canonicalModel?.output_modalities,
	);

	return {
		inputModalities:
			providerInputModalities.length > 0
				? providerInputModalities
				: canonicalInputModalities,
		outputModalities:
			providerOutputModalities.length > 0
				? providerOutputModalities
				: canonicalOutputModalities,
	};
}
