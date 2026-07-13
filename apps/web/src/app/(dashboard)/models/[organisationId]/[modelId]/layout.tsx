import type { ReactNode } from "react";
import type { Metadata } from "next";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";
import type { ModelRouteParams } from "@/components/(data)/model/model-route-helpers";
import ScrollToTopOnModelChange from "./ScrollToTopOnModelChange";

// Model detail routes remain available for product navigation, but the public
// models directory is the single search landing page for this content.
export const metadata: Metadata = {
	robots: {
		index: false,
		follow: true,
	},
};

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
