import { Outlet, useParams } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";
import ScrollToTopOnModelChange from "./ScrollToTopOnModelChange";

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

export default function ModelDetailLayout() {
	const { organisationId, modelId } = useParams({ from: "/{-$locale}/_dashboard/models/$organisationId/$modelId" });
	return (
		<>
			<ShowFooterStyle />
			<ScrollToTopOnModelChange routeKey={`${organisationId}/${modelId}`} />
			<Outlet />
		</>
	);
}
