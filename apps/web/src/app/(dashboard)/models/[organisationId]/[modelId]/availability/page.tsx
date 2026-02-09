import { redirect } from "next/navigation";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	const routeParams = await params;
	const modelId = getModelIdFromParams(routeParams);
	redirect(`/models/${modelId}/pricing`);
}
