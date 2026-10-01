"use client";

import { useMemo, useState } from "react";
import { Bolt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import { cn } from "@/lib/utils";
import { captureProductEvent } from "@/lib/productAnalytics";
import { useTranslations } from "next-intl";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "./pricing/ProviderInspectorSheet";
import Quickstart from "./quickstart/Quickstart";

export function UseModelSheet({
	modelId,
	modelName,
	gatewayMetadata,
	compact = false,
	triggerId,
	className,
}: {
	modelId: string;
	modelName: string;
	gatewayMetadata?: ModelGatewayMetadata | null;
	compact?: boolean;
	triggerId?: string;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const t = useTranslations("Catalogue.models.detail");
	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen && !open) {
			captureProductEvent("quickstart_opened", {
				model_id: modelId,
				surface: "model_page",
			});
		}
		setOpen(nextOpen);
	};
	const quickstartEndpoint = useMemo(
		() =>
			gatewayMetadata?.activeProviders.find((provider) => provider.endpoint)?.endpoint ??
			gatewayMetadata?.providers.find((provider) => provider.endpoint)?.endpoint ??
			null,
		[gatewayMetadata],
	);
	const supportedEndpoints = useMemo(
		() =>
			gatewayMetadata
				? Array.from(
						new Set(
							gatewayMetadata.activeProviders
								.map((provider) => provider.endpoint)
								.filter(Boolean),
						),
					)
				: [],
		[gatewayMetadata],
	);

	return (
		<ProviderInspectorSheet open={open} onOpenChange={handleOpenChange}>
			<Button
				id={triggerId}
				variant="default"
				size={compact ? "icon-sm" : "sm"}
				className={cn("scroll-mt-28 rounded-lg", className)}
				aria-label={compact ? t("actions.useModel", { model: modelName }) : undefined}
				aria-expanded={open}
				onClick={() => handleOpenChange(true)}
			>
				<Bolt className="h-4 w-4" />
				{compact ? null : t("actions.useThisModel")}
			</Button>
			<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[64vw] lg:!w-[58vw] xl:!w-[52vw] 2xl:!w-[48vw] data-[side=right]:sm:max-w-none">
				<ProviderInspectorSheetHeader className="shrink-0 border-b border-zinc-200/80 px-5 py-4 pr-14 dark:border-zinc-800">
					<ProviderInspectorSheetTitle className="truncate text-base">
						{t("useModelSheet.title", { model: modelName })}
					</ProviderInspectorSheetTitle>
					<ProviderInspectorSheetDescription>
						{t("useModelSheet.description")}
					</ProviderInspectorSheetDescription>
				</ProviderInspectorSheetHeader>
				<ScrollArea className="min-h-0 flex-1" viewportClassName="px-5 py-5 sm:px-6" keepScrollbarMounted>
					{gatewayMetadata ? (
						<Quickstart
							modelId={gatewayMetadata.modelId}
							aliases={gatewayMetadata.aliases}
							apiModelIds={gatewayMetadata.apiModelIds}
							primaryModelIdentifier={gatewayMetadata.primaryModelIdentifier}
							acceptedModelIdentifiers={gatewayMetadata.acceptedModelIdentifiers}
							primaryModelIdentifierByEndpoint={gatewayMetadata.primaryModelIdentifierByEndpoint}
							acceptedModelIdentifiersByEndpoint={gatewayMetadata.acceptedModelIdentifiersByEndpoint}
							supportedParametersByEndpoint={gatewayMetadata.supportedParametersByEndpoint}
							endpoint={quickstartEndpoint}
							supportedEndpoints={supportedEndpoints}
							showHeader={false}
						/>
					) : (
						<Quickstart
							mode="model-metadata"
							modelId={modelId}
							acceptedModelIdentifiers={[modelId]}
							showHeader={false}
						/>
					)}
				</ScrollArea>
			</ProviderInspectorSheetContent>
		</ProviderInspectorSheet>
	);
}
