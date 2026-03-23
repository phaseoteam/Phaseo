import { Suspense } from "react";
import CouncilClient from "@/components/(experiments)/CouncilClient";
import NoFooterStyle from "@/components/layout/NoFooterStyle";
import { fetchExperimentsCouncilModels } from "@/lib/fetchers/frontend/fetchExperimentsCouncilModels";
import { buildDefaultCouncilPresets } from "@/lib/experiments/councilPresets";

type CouncilRunPageProps = {
	params: Promise<{ runId: string }>;
};

export default async function CouncilRunPage({ params }: CouncilRunPageProps) {
	return (
		<>
			<NoFooterStyle />
			<Suspense fallback={<CouncilRunPageFallback />}>
				<CouncilRunPageContent params={params} />
			</Suspense>
		</>
	);
}

function CouncilRunPageFallback() {
	return (
		<div className="flex min-h-0 flex-1 bg-white dark:bg-zinc-950">
			<aside className="hidden w-72 shrink-0 border-r border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950 lg:flex lg:flex-col">
				<div className="px-3 py-3">
					<p className="text-sm font-semibold">LLM Council</p>
					<p className="text-xs text-zinc-500">Council chats</p>
					<div className="mt-2 h-9 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>
				<div className="px-3 pt-1">
					<p className="mb-2 text-xs font-medium text-zinc-500">Recent Runs</p>
					<div className="space-y-2">
						<div className="h-14 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
						<div className="h-14 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
						<div className="h-14 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
					</div>
				</div>
			</aside>

			<div className="mx-auto flex w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
				<div className="w-full space-y-5">
					<div className="space-y-1">
						<div className="h-4 w-16 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
						<div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/30" />
					</div>
					<div className="space-y-3">
						<div className="h-5 w-14 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
						<div className="h-10 rounded-xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/30" />
						<div className="h-14 rounded-xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/30" />
						<div className="h-14 rounded-xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/30" />
					</div>
					<div className="h-9 w-40 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
				</div>
			</div>
		</div>
	);
}

async function CouncilRunPageContent({ params }: CouncilRunPageProps) {
	const resolvedParams = await params;
	const parsedRunId = Number.parseInt(resolvedParams.runId, 10);
	const initialSelectedRunId =
		Number.isInteger(parsedRunId) && parsedRunId > 0 ? parsedRunId : null;

	const models = await fetchExperimentsCouncilModels();
	const initialPresets = buildDefaultCouncilPresets(models.map((model) => model.modelId));

	return (
		<CouncilClient
			models={models}
			initialPresets={initialPresets}
			initialSelectedRunId={initialSelectedRunId}
		/>
	);
}

