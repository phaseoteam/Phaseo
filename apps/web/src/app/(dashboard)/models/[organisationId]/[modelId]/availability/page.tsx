import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

export const metadata: Metadata = {
	title: "Model availability redirect",
	description:
		"Redirect route to the model providers page on AI Stats for availability details.",
	robots: {
		index: false,
		follow: false,
	},
};

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	const routeParams = await params;
	const includeHidden = false;
	const { canonicalModelId } = await resolveModelRouteIds(
		routeParams,
		includeHidden,
	);
	permanentRedirect(getModelPath(canonicalModelId, "providers"));
}
