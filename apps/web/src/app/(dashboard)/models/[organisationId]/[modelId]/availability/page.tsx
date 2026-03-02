import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
	getModelIdFromParams,
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
	const modelId = getModelIdFromParams(routeParams);
	redirect(`/models/${modelId}/providers`);
}
