import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { ActivatePage, getActivateMetadata } from "@/features/activate/ActivatePage";
import { getActivateSignInRedirect } from "@/features/activate/page.functions";
import { redirect } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getActivateMetadata()));

export const Route = createFileRoute("/{-$locale}/_auth/activate/")({
	loader: async ({ location }) => {
		const metadataPromise = routeMetadata();
		metadataPromise.catch(() => undefined);
		const userCodeParam = (location.search as Record<string, unknown>).user_code;
		const userCode = typeof userCodeParam === "string" ? userCodeParam : null;
		const signInRedirect = await getActivateSignInRedirect({ data: userCode });
		if (signInRedirect) redirect(signInRedirect);
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ActivatePage,
});
