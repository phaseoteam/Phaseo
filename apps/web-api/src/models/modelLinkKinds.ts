/**
 * The kinds a model link can have. Mirrors the `v2_model_links_link_kind_check` constraint and
 * `apps/web/src/lib/models/modelLinks.ts`. The kind only groups a link, picks its default icon and
 * fills the comparison columns; the link's title is what people see.
 */
export const MODEL_LINK_KINDS = [
	"announcement",
	"model_card",
	"paper",
	"weights",
	"repository",
	"documentation",
	"api_reference",
	"playground",
	"pricing",
	"benchmark",
	"website",
	"provider",
	"deprecation",
	"license",
] as const;

export type ModelLinkKind = (typeof MODEL_LINK_KINDS)[number];
