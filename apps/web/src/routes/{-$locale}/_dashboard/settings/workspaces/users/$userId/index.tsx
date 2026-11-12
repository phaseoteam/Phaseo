import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import WorkspaceUserPage, { getWorkspaceUserMetadata } from "@/features/settings/workspaces/users/userId/WorkspaceUserPage";
import { notFound } from "@/lib/navigation";
import { redirect } from "@/i18n/navigation";
import { workspaceUserQuery } from "@/features/settings/workspaces/users/userId/workspaceUser.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getWorkspaceUserMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/users/$userId/")({
	beforeLoad: async ({ context, params, search }) => {
		const locale = params.locale ?? "en-GB";
		const query = search as Record<string, unknown>;
		const result = await context.queryClient.ensureQueryData(workspaceUserQuery(params.userId, query.workspaceId, query.keyPage));
		if (result.kind === "self") redirect({ href: "/settings/profile", locale });
		if (result.kind === "notFound") notFound();
		if (result.kind === "unauthorized") redirect({ href: "/sign-in", locale });
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: WorkspaceUserPage,
});
