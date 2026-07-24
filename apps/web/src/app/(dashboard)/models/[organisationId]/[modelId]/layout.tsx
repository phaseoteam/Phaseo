import type { ReactNode } from "react";
import type { Metadata } from "next";
import ShowFooterStyle from "@/components/layout/ShowFooterStyle";
import type { ModelRouteParams } from "@/components/(data)/model/model-route-helpers";
import ScrollToTopOnModelChange from "./ScrollToTopOnModelChange";

// Model overview pages override this with indexable metadata. Secondary tabs
// remain noindex to consolidate search signals on the canonical overview URL.
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
