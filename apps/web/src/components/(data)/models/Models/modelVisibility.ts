export type ModelVisibility = "internal" | "private" | null;

type VisibilityFields = {
	hidden?: boolean | null;
	is_private?: boolean | null;
	gateway_tiers?: string[] | null;
};

// Hidden models only reach the catalogue through the admin staged-models
// query, so they are internal until published. Private models are served only
// through a workspace's own private endpoints. A model that also has a public
// route is not marked private.
export function resolveModelVisibility(model: VisibilityFields): ModelVisibility {
	if (model.hidden === true) return "internal";
	if (model.is_private === true) return "private";
	const tiers = model.gateway_tiers ?? [];
	if (tiers.length > 0 && tiers.every((tier) => tier === "private")) return "private";
	return null;
}
