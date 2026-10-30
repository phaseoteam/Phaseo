// src/components/gateway/Hero.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, CircleSlash, Clock3 } from "lucide-react";
import { DOCS_VERSION } from "./config";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import { groupProviders } from "./providerAvailability";

interface HeroProps {
	metadata: ModelGatewayMetadata;
}

export default async function Hero({ metadata }: HeroProps) {
	const t = await getTranslations("Catalogue.models.detail.quickstart");
	const groupedProviders = groupProviders(metadata);
	const activeCount = groupedProviders.filter(
		(provider) => provider.state.availability === "active"
	).length;
	const previewCount = groupedProviders.filter(
		(provider) => provider.state.availability === "coming_soon"
	).length;
	const inactiveCount = groupedProviders.filter(
		(provider) => provider.state.availability === "inactive"
	).length;
	const isAvailable = activeCount > 0;

	const StatusIcon = isAvailable ? CheckCircle2 : CircleSlash;
	const statusText = isAvailable
		? t("availableVia", { count: activeCount })
		: previewCount > 0
			? t("knownButNotRoutable")
			: t("currentlyUnavailableInGateway");

	return (
		<Card>
			<CardHeader className="p-6">
				<div className="flex items-center justify-between w-full">
					<div className="flex-1">
						<CardTitle className="text-3xl">
							{t("gatewayTitle")}
						</CardTitle>
						<CardDescription className="mt-2 text-muted-foreground">
							{t("gatewayDescription")}
						</CardDescription>
					</div>

					<div className="flex-shrink-0 ml-6">
						<Link
							href={`https://phaseo.app/`}
							aria-label={t("readDocsVersion", { version: DOCS_VERSION })}
							className="inline-flex items-center"
						>
							<span className="text-xs rounded-full border px-2 py-0.5 font-medium">
								{DOCS_VERSION}
							</span>
						</Link>
					</div>
				</div>
			</CardHeader>
			<CardContent className="px-6 pb-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2 text-sm">
						<StatusIcon
							className={`h-4 w-4 ${
								isAvailable
									? "text-emerald-500"
									: "text-destructive"
							}`}
						/>
						<span className="font-medium">{statusText}</span>
					</div>
					<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
						<Badge variant="outline" className="bg-background">
							{t("activeCount", { count: activeCount })}
						</Badge>
						{previewCount > 0 ? (
							<Badge variant="outline" className="bg-background">
								<span className="inline-flex items-center gap-1">
									<Clock3 className="h-3 w-3" />
												{t("previewCount", { count: previewCount })}
								</span>
							</Badge>
						) : null}
						<Badge variant="outline" className="bg-background">
							{t("unavailableCount", { count: inactiveCount })}
						</Badge>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
