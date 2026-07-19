import type { ReactNode } from "react";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";
import type { ModelRouteParams } from "@/components/(data)/model/model-route-helpers";
import ScrollToTopOnModelChange from "./ScrollToTopOnModelChange";

export default async function ModelDetailLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<ModelRouteParams>;
}) {
	const { organisationId, modelId } = await params;
	const routeKey = `${organisationId}/${modelId}`;

	return (
		<>
			<ShowFooterStyle />
			<ScrollToTopOnModelChange routeKey={routeKey} />
			{children}
		</>
	);
}
