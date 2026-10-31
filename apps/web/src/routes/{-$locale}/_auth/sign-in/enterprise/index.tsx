import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { EnterpriseSignInPage, getEnterpriseSignInMetadata } from "@/features/sign-in/enterprise/EnterpriseSignInPage";
import { samlSsoEnabledQuery } from "@/features/sign-in/SignInPage.functions";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getEnterpriseSignInMetadata()));

export const Route = createFileRoute("/{-$locale}/_auth/sign-in/enterprise/")({
	loader: async ({ context }) => {
		const metadataPromise = routeMetadata();
		metadataPromise.catch(() => undefined);
		if (!(await context.queryClient.ensureQueryData(samlSsoEnabledQuery()))) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: EnterpriseSignInPage,
});
