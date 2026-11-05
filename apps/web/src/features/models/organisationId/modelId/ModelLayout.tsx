import { Outlet, useParams } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";
import ScrollToTopOnModelChange from "./ScrollToTopOnModelChange";
export { getModelLayoutMetadata } from "./modelLayoutMetadata";


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
