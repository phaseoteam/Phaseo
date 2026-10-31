import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import BenchmarkPage, { getBenchmarkMetadata } from "@/features/benchmarks/benchmarkId/BenchmarkPage";
import BenchmarkLoading from "@/features/benchmarks/benchmarkId/BenchmarkLoading";
import { benchmarkQuery, benchmarkSelection } from "@/features/benchmarks/benchmarkId/page.queries";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getBenchmarkMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/benchmarks/$benchmarkId/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		const selection = benchmarkSelection(params.benchmarkId, location.search as Record<string, unknown>);
		if (!(await context.queryClient.ensureQueryData(benchmarkQuery(params.benchmarkId, selection)))) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: BenchmarkLoading,
	component: BenchmarkPage,
});
