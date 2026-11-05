import type { PageMetadata } from "@/lib/seo/metadataTypes";

// Model overview pages override this with indexable metadata. Secondary tabs
// remain noindex to consolidate search signals on the canonical overview URL.
export function getModelLayoutMetadata(): PageMetadata {
	return {
		robots: {
			index: false,
			follow: true,
		},
	};
}
