import { notFound } from "@/lib/navigation";
import Link from "@/components/link";
import { useParams, useSearch } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { adminCatalogRecordQuery } from "../../../catalog.functions";
import ModelLegacyEditor from "./ModelLegacyEditor";
import ModelRevalidationControls from "./ModelRevalidationControls";
import ModelSuccessorRoutingPanel from "./ModelSuccessorRoutingPanel";
import SendModelDiscordNotificationButton from "./SendModelDiscordNotificationButton";

const ROUTE_ID = "/{-$locale}/_dashboard/internal/data/models/edit/$";

export default function EditModelPage() {
	const t = useTranslations("Product.internalTools.dataEditor");
	// The model id is the rest of the path, for example `openai/gpt-5`.
	const { _splat = "" } = useParams({ from: ROUTE_ID });
	const query = useSearch({ from: ROUTE_ID }) as { tab?: string; provider?: string };
	const modelId = _splat.split("/").filter(Boolean).map(decodeURIComponent).join("/");
	const initialTab =
		typeof query.tab === "string" && query.tab.trim()
			? query.tab.trim()
			: undefined;
	const focusProviderId =
		typeof query.provider === "string" && query.provider.trim()
			? query.provider.trim()
			: undefined;
	const { data: { row } } = useSuspenseQuery(adminCatalogRecordQuery("model", modelId));
	if (!row) return notFound();

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{String(row.name || t("modelEditTitle"))}</h1>
					<p className="font-mono text-xs text-muted-foreground">{row.model_id}</p>
				</div>
				<SendModelDiscordNotificationButton modelId={modelId} />
			</div>
			<ModelLegacyEditor
				key={`${modelId}:${initialTab ?? "basic"}`}
				modelId={modelId}
				initialTab={initialTab}
				focusProviderId={focusProviderId}
			/>
			<ModelSuccessorRoutingPanel key={modelId} modelId={modelId} />
			<ModelRevalidationControls modelId={modelId} />
			<div className="flex">
				<Link href="/internal/data/models" className="rounded-md border px-3 py-2 text-sm">
					{t("backToModels")}
				</Link>
			</div>
		</div>
	);
}
