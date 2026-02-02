import { ReactNode, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import TabBar from "@/components/(data)/model/ModelTabs";
import { Logo } from "@/components/Logo";
import { withUTM } from "@/lib/utm";
import ModelEditButton from "./edit/ModelEditButton";
import { Badge } from "@/components/ui/badge";

interface ModelDetailShellProps {
	modelId: string;
	children: ReactNode;
	tab?: string;
	includeHidden?: boolean;
}

export default async function ModelDetailShell({
	modelId,
	children,
	tab,
	includeHidden = false,
}: ModelDetailShellProps) {
	const header = await getModelOverviewHeader(modelId, includeHidden);

	if (!header) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center md:p-8">
						<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<span className="text-xl">🤖</span>
						</div>
						<p className="text-base font-medium">Model not found</p>
						<p className="mt-1 text-sm text-muted-foreground">
							We&apos;re continuously adding new models. Got one
							to suggest?
						</p>
						<div className="mt-3">
							<a
								href={withUTM(
									"https://github.com/AI-Stats/AI-Stats",
									{
										campaign: "model-empty-state",
										content: "model-detail-shell",
									}
								)}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								Contribute on GitHub
								<Image
									src="/social/github_light.svg"
									alt="GitHub Logo"
									width={16}
									height={16}
									className="inline dark:hidden"
								/>
								<Image
									src="/social/github_dark.svg"
									alt="GitHub Logo"
									width={16}
									height={16}
									className="hidden dark:inline"
								/>
							</a>
						</div>
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex w-full flex-col items-center justify-between gap-2 md:flex-row md:items-start md:gap-0">
					<div className="flex flex-col items-center gap-4 md:flex-row">
						<div className="flex items-center justify-center">
							<div className="relative flex h-12 w-12 items-center justify-center rounded-xl border md:h-24 md:w-24">
								<div className="relative h-10 w-10 md:h-20 md:w-20">
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
								<h1 className="mb-1 text-center text-3xl font-bold md:text-left md:text-5xl">
									{header.name}
								</h1>
								{includeHidden && header.hidden ? (
									<Badge variant="secondary">Hidden</Badge>
								) : null}
								<Suspense fallback={null}>
									<ModelEditButton
										modelId={modelId}
										tab={tab}
									/>
								</Suspense>
							</div>
							<Link
								href={`/organisations/${header.organisation_id}`}
							>
								<h2 className="mb-1 text-center text-md font-semibold md:text-left md:text-xl">
									{header.organisation.name}
								</h2>
							</Link>
						</div>
					</div>

					{header.organisation.country_code && (
						<div className="mt-2 flex h-full items-center justify-center md:mt-0 md:ml-6">
							<Link
								href={`/countries/${header.organisation.country_code.toLowerCase()}`}
							>
								<Image
									src={`/flags/${header.organisation.country_code.toLowerCase()}.svg`}
									alt={header.organisation.country_code}
									width={64}
									height={48}
									className="h-auto w-12 rounded-md border object-cover shadow-lg md:w-24"
								/>
							</Link>
						</div>
					)}
				</div>

				<TabBar modelId={modelId} />

				<div className="mt-6 min-h-full">{children}</div>
			</div>
		</main>
	);
}
