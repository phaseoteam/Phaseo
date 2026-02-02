// src/components/gateway/Hero.tsx
import Link from "next/link";
import { CheckCircle2, CircleSlash } from "lucide-react";
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

interface HeroProps {
	metadata: ModelGatewayMetadata;
}

export default function Hero({ metadata }: HeroProps) {
	const activeProviderIds = new Set(
		metadata.activeProviders.map((p) => p.api_provider_id)
	);
	const inactiveProviderIds = new Set(
		metadata.inactiveProviders
			.map((p) => p.api_provider_id)
			.filter((id) => !activeProviderIds.has(id))
	);
	const activeCount = activeProviderIds.size;
	const inactiveCount = inactiveProviderIds.size;
	const isAvailable = activeCount > 0;

	const StatusIcon = isAvailable ? CheckCircle2 : CircleSlash;
	const statusText = isAvailable
		? `Available via ${activeCount} provider${activeCount === 1 ? "" : "s"}`
		: "Currently unavailable in the gateway";

	return (
		<Card>
			<CardHeader className="p-6">
				<div className="flex items-center justify-between w-full">
					<div className="flex-1">
						<CardTitle className="text-3xl">
							Get Started With Gateway
						</CardTitle>
						<CardDescription className="mt-2 text-muted-foreground">
							Access and manage any model through our unified API.
						</CardDescription>
					</div>

					<div className="flex-shrink-0 ml-6">
						<Link
							href={`https://docs.ai-stats.phaseo.app/`}
							aria-label={`Read the docs (v${DOCS_VERSION})`}
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
							Active: {activeCount}
						</Badge>
						<Badge variant="outline" className="bg-background">
							Inactive: {inactiveCount}
						</Badge>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
