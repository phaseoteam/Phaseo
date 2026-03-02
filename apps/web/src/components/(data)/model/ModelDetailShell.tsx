import { ReactNode, Suspense } from "react";
import Link from "next/link";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import TabBar from "@/components/(data)/model/ModelTabs";
import { Logo } from "@/components/Logo";
import ModelEditButton from "./edit/ModelEditButton";
import { Badge } from "@/components/ui/badge";
import ModelNotFoundState from "@/components/(data)/model/ModelNotFoundState";
import { Button } from "@/components/ui/button";
import { MessageSquare, Scale } from "lucide-react";

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

export default async function ModelDetailShell({
	modelId,
	children,
	tab,
	includeHidden = false,
}: ModelDetailShellProps) {
	const header = await getModelOverviewHeader(modelId, includeHidden).catch((error) => {
		if (isModelNotFoundError(error)) {
			return null;
		}
		throw error;
	});

	if (!header) {
		return <ModelNotFoundState modelId={modelId} />;
	}

	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex w-full flex-col items-center justify-between gap-2 md:flex-row md:items-start md:gap-0">
					<div className="flex flex-col items-center gap-4 md:flex-row">
						<div className="flex items-center justify-center">
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
						<div className="flex flex-col items-center justify-center md:items-start">
							<div className="flex items-center gap-3">
								<h1 className="mb-1 text-center text-3xl font-bold md:text-left">
									{header.name}
								</h1>
								{includeHidden && header.hidden ? (
									<Badge variant="secondary">Hidden</Badge>
								) : null}
								<Suspense fallback={null}>
									<ModelEditButton modelId={modelId} tab={tab} />
								</Suspense>
							</div>
							<Link href={`/organisations/${header.organisation_id}`}>
								<h2 className="mb-1 text-center text-md font-semibold md:text-left md:text-xl">
									{header.organisation.name}
								</h2>
							</Link>
						</div>
					</div>

					<div className="mt-2 flex w-full flex-col gap-2 md:mt-0 md:ml-6 md:w-auto">
						<Button asChild variant="outline" size="sm" className="justify-center">
							<Link href={`/chat?model=${modelId}`}>
								<MessageSquare className="h-4 w-4" />
								Chat
							</Link>
						</Button>
						<Button asChild variant="outline" size="sm" className="justify-center">
							<Link href={`/compare?models=${modelId}`}>
								<Scale className="h-4 w-4" />
								Compare
							</Link>
						</Button>
					</div>
				</div>

				<TabBar modelId={modelId} />

				<div className="mt-6 min-h-full">{children}</div>
			</div>
		</main>
	);
}
