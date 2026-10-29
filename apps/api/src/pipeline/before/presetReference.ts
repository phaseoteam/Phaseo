// Purpose: Parse preset references used as a model ID
// Why: "@slug", "@handle/slug" and their pinned forms "@slug@ref" and
//      "@handle/slug@ref" must be read the same way everywhere, and the same way
//      as gateway_fetch_request_context_without_workspace_budget does
// How: Split the version ref off at the first "@" after the leading one, then
//      the publisher handle off at the first "/"

export type PresetReference = {
	/** Publisher handle for public references ("@handle/slug"), else null. */
	publisher: string | null;
	slug: string;
	/** Version label or named label after the second "@", else null. */
	ref: string | null;
	/** The reference without its ref: "@slug" or "@handle/slug". */
	base: string;
};

export function isPresetModel(model: unknown): model is string {
	return typeof model === "string" && model.startsWith("@");
}

export function parsePresetReference(model: string): PresetReference | null {
	if (!isPresetModel(model)) return null;
	let name = model.slice(1);
	let ref: string | null = null;
	const at = name.indexOf("@");
	if (at >= 0) {
		ref = name.slice(at + 1);
		name = name.slice(0, at);
	}
	const slash = name.indexOf("/");
	const publisher = slash >= 0 ? name.slice(0, slash) : null;
	const slug = slash >= 0 ? name.slice(slash + 1) : name;
	return { publisher, slug, ref, base: `@${name}` };
}

export function pinnedPresetModel(base: string, ref: string | null): string {
	return ref ? `${base}@${ref}` : base;
}
