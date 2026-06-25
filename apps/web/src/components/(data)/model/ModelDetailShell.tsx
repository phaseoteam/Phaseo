import { ReactNode, Suspense } from "react";
import Link from "next/link";
import {
	fetchFrontendModelHeader,
	fetchFrontendModelOverview,
	fetchFrontendModelPageNotice,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import TabBar from "@/components/(data)/model/ModelTabs";
import { Logo } from "@/components/Logo";
import ModelEditButton from "./edit/ModelEditButton";
import { Badge } from "@/components/ui/badge";
import ModelNotFoundState from "@/components/(data)/model/ModelNotFoundState";
import { Button } from "@/components/ui/button";
import { MessageSquare, Scale } from "lucide-react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import ModelIdentifierControl from "./ModelIdentifierControl";
import ModelDescriptionPanel from "./ModelDescriptionPanel";
import ModelPageNotice from "./ModelPageNotice";
import ModelStatusBanner from "./overview/ModelStatusBanner";
import { resolveModelDescription } from "@/lib/models/modelDescription";
import {
	FREE_ROUTER_DESCRIPTION,
	FREE_ROUTER_MODEL_ID,
	FREE_ROUTER_NAME,
	FREE_ROUTER_ORGANISATION_ID,
	isFreeRouterModelId,
} from "@/lib/models/freeRouter";

interface ModelDetailShellProps {
	modelId: string;
	children: ReactNode;
	tab?: string;
	includeHidden?: boolean;
}

function isModelNotFoundError(error: unknown): boolean {
	const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
	if (message.includes("model not found")) return true;
	return false;
}

function getVisibleTabKeys(modelStatus?: string | null): string[] {
	const isLimitedAvailabilityModel =
		modelStatus === "Announced" || modelStatus === "Withheld";
	if (isLimitedAvailabilityModel) {
		return ["overview"];
	}

	return [
		"overview",
		"playground",
		"providers",
		"pricing",
		"performance",
		"apps",
		"activity",
		"quickstart",
		"benchmarks",
		"family",
		"timeline",
	];
}

export default async function ModelDetailShell({
	modelId,
	children,
	tab,
	includeHidden = false,
}: ModelDetailShellProps) {
	const isFreeRouter = isFreeRouterModelId(modelId);
	const [header, modelOverview, modelPageNotice] = isFreeRouter
		? [
				{
					model_id: FREE_ROUTER_MODEL_ID,
					name: FREE_ROUTER_NAME,
					organisation_id: FREE_ROUTER_ORGANISATION_ID,
					organisation: {
						name: "AI Stats",
						country_code: "",
					},
					aliases: [],
					status: "Available",
					hidden: false,
				},
				null,
				null,
			]
		: await Promise.all([
				fetchFrontendModelHeader(modelId, includeHidden).catch((error) => {
					if (isModelNotFoundError(error)) {
						return null;
					}
					throw error;
				}),
				fetchFrontendModelOverview(modelId).catch(() => null),
				fetchFrontendModelPageNotice(modelId, includeHidden).catch(() => null),
			]);

	if (!header) {
		return <ModelNotFoundState modelId={modelId} />;
	}
	const modelDescription = isFreeRouter
		? FREE_ROUTER_DESCRIPTION
		: modelOverview
		? resolveModelDescription(modelOverview)
		: null;

	const visibleTabKeys = getVisibleTabKeys(header.status);
	const scopedVisibleTabKeys = isFreeRouter
		? ["overview"]
		: visibleTabKeys;
	if (tab && !scopedVisibleTabKeys.includes(tab)) {
		redirect(`/models/${modelId}`);
	}

	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				{modelPageNotice ? (
					<div className="mb-6">
						<ModelPageNotice notice={modelPageNotice} />
					</div>
				) : (
					<ModelStatusBanner status={header.status} className="mb-6" />
				)}

				<div className="mb-8 flex w-full flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="flex w-full items-start gap-4">
						<div className="flex shrink-0 items-center justify-center">
							<div className="relative flex h-10 w-10 items-center justify-center rounded-xl border md:h-16 md:w-16">
								<div className="relative h-8 w-8 md:h-12 md:w-12">
									<Logo
										id={header.organisation_id}
										alt={header.name}
										className="object-contain"
										fill
									/>
								</div>
							</div>
						</div>
						<div className="flex min-w-0 flex-1 flex-col justify-center">
							<div className="flex flex-col items-start gap-3 md:flex-row md:flex-wrap md:items-start md:gap-5">
								<h1 className="text-3xl font-bold leading-tight text-left">
									<Link
										href={`/organisations/${header.organisation_id}`}
										className="underline-offset-4 hover:underline"
									>
										{header.organisation.name}:
									</Link>{" "}
									<span>{header.name}</span>
								</h1>
								<Suspense fallback={null}>
									<ModelEditButton modelId={modelId} tab={tab} />
								</Suspense>
								{includeHidden && header.hidden ? (
									<Badge variant="secondary">Hidden</Badge>
								) : null}
							</div>
							<div className="mt-2 flex w-full flex-col items-start gap-2">
								<ModelIdentifierControl
									defaultIdentifier={header.model_id}
									aliases={header.aliases}
								/>
							</div>
						</div>
					</div>

					<div className="flex w-full flex-row gap-2 md:mt-0 md:ml-6 md:w-auto md:flex-col">
						<Button asChild variant="outline" size="sm" className="flex-1 justify-center md:flex-none">
							<Link href={`/chat?model=${modelId}`}>
								<MessageSquare className="h-4 w-4" />
								Chat
							</Link>
						</Button>
						<Button asChild variant="outline" size="sm" className="flex-1 justify-center md:flex-none">
							<Link href={`/compare?models=${modelId}`}>
								<Scale className="h-4 w-4" />
								Compare
							</Link>
						</Button>
					</div>
				</div>

				{modelDescription ? (
					<div className="w-full">
						<ModelDescriptionPanel description={modelDescription} />
					</div>
				) : null}

				<TabBar modelId={modelId} visibleTabKeys={scopedVisibleTabKeys} />

				<div className="mt-6 min-h-full">{children}</div>
			</div>
		</main>
	);
}

export function ModelDetailShellSkeleton({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex w-full flex-col items-center justify-between gap-2 md:flex-row md:items-start md:gap-0">
					<div className="flex flex-col items-center gap-4 md:flex-row">
						<div className="flex items-center justify-center">
							<div className="relative flex h-10 w-10 items-center justify-center rounded-xl border md:h-16 md:w-16">
								<Skeleton className="h-8 w-8 rounded-lg md:h-12 md:w-12" />
							</div>
						</div>
						<div className="flex flex-col items-center justify-center md:items-start">
							<div className="flex items-center gap-3">
								<Skeleton className="mb-1 h-9 w-56" />
							</div>
							<Skeleton className="mb-1 h-5 w-40" />
						</div>
					</div>

					<div className="mt-2 flex w-full flex-col gap-2 md:mt-0 md:ml-6 md:w-auto">
						<Skeleton className="h-9 w-full md:w-24" />
						<Skeleton className="h-9 w-full md:w-24" />
					</div>
				</div>
				<Skeleton className="mb-4 h-12 w-full rounded-md" />

				<div className="mt-6 min-h-full">{children}</div>
			</div>
		</main>
	);
}
