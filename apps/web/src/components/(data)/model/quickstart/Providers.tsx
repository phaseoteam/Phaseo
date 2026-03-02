import Link from "next/link";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import ProviderInfoHoverIcons from "@/components/(data)/model/ProviderInfoHoverIcons";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";

type GroupedProvider = {
	providerId: string;
	providerName: string;
	endpoints: Set<string>;
	modelSlugs: Set<string>;
	quantizationSchemes: Set<string>;
	isActive: boolean;
};

function groupProviders(metadata: ModelGatewayMetadata): GroupedProvider[] {
	const grouped = new Map<string, GroupedProvider>();

	for (const item of metadata.providers) {
		const providerId = item.api_provider_id;
		if (!providerId) continue;
		const current = grouped.get(providerId);
		const isActive = metadata.activeProviders.some(
			(active) => active.api_provider_id === providerId
		);

		if (current) {
			if (item.endpoint) current.endpoints.add(item.endpoint);
			if (item.provider_model_slug) current.modelSlugs.add(item.provider_model_slug);
			if (item.quantization_scheme)
				current.quantizationSchemes.add(item.quantization_scheme);
			current.isActive = current.isActive || isActive;
			continue;
		}

		const endpoints = new Set<string>();
		const modelSlugs = new Set<string>();
		const quantizationSchemes = new Set<string>();
		if (item.endpoint) endpoints.add(item.endpoint);
		if (item.provider_model_slug) modelSlugs.add(item.provider_model_slug);
		if (item.quantization_scheme) quantizationSchemes.add(item.quantization_scheme);

		grouped.set(providerId, {
			providerId,
			providerName:
				item.provider?.api_provider_name ??
				item.api_provider_id,
			endpoints,
			modelSlugs,
			quantizationSchemes,
			isActive,
		});
	}

	return Array.from(grouped.values()).sort((a, b) => {
		if (a.isActive && !b.isActive) return -1;
		if (!a.isActive && b.isActive) return 1;
		return a.providerName.localeCompare(b.providerName);
	});
}

export default function Providers({ metadata }: { metadata: ModelGatewayMetadata }) {
	const providers = groupProviders(metadata);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">Provider Availability</CardTitle>
			</CardHeader>
			<CardContent>
				{providers.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{providers.map((provider) => (
							<div
								key={provider.providerId}
								className="rounded-lg border border-slate-200/80 p-3 dark:border-slate-800/90"
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex min-w-0 items-center gap-2.5">
										<Link
											href={`/api-providers/${provider.providerId}`}
											className="group"
										>
											<div className="relative flex h-8 w-8 items-center justify-center rounded-lg border">
												<div className="relative h-5 w-5">
													<Logo
														id={provider.providerId}
														alt={`${provider.providerName} logo`}
														fill
														className="object-contain group-hover:opacity-80 transition"
													/>
												</div>
											</div>
										</Link>
										<div className="min-w-0">
											<Link
												href={`/api-providers/${provider.providerId}`}
												className="truncate text-sm font-medium hover:text-primary transition-colors"
											>
												{provider.providerName}
											</Link>
											<p className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">
												{provider.providerId}
											</p>
										</div>
									</div>

									<Badge variant={provider.isActive ? "default" : "secondary"}>
										{provider.isActive ? (
											<span className="inline-flex items-center gap-1">
												<CheckCircle2 className="h-3 w-3" />
												Active
											</span>
										) : (
											<span className="inline-flex items-center gap-1">
												<CircleSlash className="h-3 w-3" />
												Inactive
											</span>
										)}
									</Badge>
								</div>

								<div className="mt-3 flex items-center justify-between gap-2">
									<p className="text-[11px] text-muted-foreground">
										{provider.endpoints.size} endpoint
										{provider.endpoints.size === 1 ? "" : "s"}
									</p>
									<ProviderInfoHoverIcons
										providerId={provider.providerId}
										providerModelSlugs={Array.from(provider.modelSlugs)}
										quantizationSchemes={Array.from(provider.quantizationSchemes)}
									/>
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No provider mappings are listed for this model yet.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
