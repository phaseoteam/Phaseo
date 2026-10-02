import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fetchAdminCatalogRecord } from "@/lib/fetchers/internal/fetchAdminCatalog";
import ModelLegacyEditor from "./ModelLegacyEditor";
import ModelRevalidationControls from "./ModelRevalidationControls";
import SendModelDiscordNotificationButton from "@/app/(dashboard)/internal/data/models/edit/[...modelId]/SendModelDiscordNotificationButton";

export default async function EditModelPage({
	params,
	searchParams,
}: {
	params: Promise<{ modelId: string[] }>;
	searchParams: Promise<{ tab?: string; provider?: string }>;
}) {
	const t = await getTranslations("Product.internalTools.dataEditor");
	const { modelId: modelIdParts } = await params;
	const query = await searchParams;
	const modelId = modelIdParts.join("/");
	const initialTab =
		typeof query.tab === "string" && query.tab.trim()
			? query.tab.trim()
			: undefined;
	const focusProviderId =
		typeof query.provider === "string" && query.provider.trim()
			? query.provider.trim()
			: undefined;
	const { row } = await fetchAdminCatalogRecord("model", modelId);
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
			<ModelRevalidationControls modelId={modelId} />
			<div className="flex">
				<Link href="/internal/data/models" className="rounded-md border px-3 py-2 text-sm">
					{t("backToModels")}
				</Link>
			</div>
		</div>
	);
}
