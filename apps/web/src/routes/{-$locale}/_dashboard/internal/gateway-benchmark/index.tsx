import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import GatewayBenchmarkPage, { getGatewayBenchmarkMetadata } from "@/features/internal/gateway-benchmark/GatewayBenchmarkPage";
import { requireInternalAdminFn } from "@/features/internal/internalAdmin.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getGatewayBenchmarkMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/gateway-benchmark/")({
	// Internal admins only (requireInternalAdmin), checked before anything renders.
	beforeLoad: async () => {
		await requireInternalAdminFn({ data: "/" });
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: GatewayBenchmarkPage,
});
