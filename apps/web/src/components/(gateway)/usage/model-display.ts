export type ModelMetadataEntry = {
	organisationId: string;
	organisationName: string;
	modelName?: string;
};

export type ModelMetadataMap = Map<string, ModelMetadataEntry>;

function modelIdVariants(modelId: string): string[] {
	const variants = new Set<string>();

	const add = (value: string | null | undefined) => {
		const v = value?.trim();
		if (!v) return;
		variants.add(v);
		variants.add(v.toLowerCase());
		variants.add(v.replace(/\./g, "-"));
	};

	add(modelId);

	if (modelId.includes("/")) {
		add(modelId.split("/").slice(1).join("/"));
	}

	for (const current of Array.from(variants)) {
		if (current.includes(":")) {
			const parts = current.split(":");
			add(parts[0]);
			add(parts.slice(1).join(":"));
		}
	}

	return Array.from(variants);
}

function fallbackModelId(modelId: string): string {
	if (modelId.includes("/")) {
		const noOrg = modelId.split("/").slice(1).join("/");
		if (noOrg) return noOrg;
	}
	return modelId;
}

export function getModelDisplayName(
	modelId: string | null,
	modelMetadata: ModelMetadataMap,
): string {
	if (!modelId) return "-";

	for (const variant of modelIdVariants(modelId)) {
		const explicit = modelMetadata.get(variant)?.modelName?.trim();
		if (explicit) return explicit;
	}

	return fallbackModelId(modelId);
}
