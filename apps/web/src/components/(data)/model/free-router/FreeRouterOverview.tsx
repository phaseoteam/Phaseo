import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchFrontendFreeRouterOverview } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { FREE_ROUTER_MODEL_ID } from "@/lib/models/freeRouter";
import { Badge } from "@/components/ui/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

function formatCostNanos(value: number, locale: string): string {
	const amount = Number.isFinite(value) && value > 0 ? value / 1e9 : 0;
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: amount >= 1 ? 2 : 5,
	}).format(amount);
}

function formatNumber(value: number, locale: string): string {
	return new Intl.NumberFormat(locale).format(Math.round(value));
}

function formatDate(value: string | null, locale: string, neverLabel: string): string {
	if (!value) return neverLabel;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return neverLabel;
	return parsed.toLocaleDateString(locale, {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function formatModality(value: string, labels: Record<string, string>): string {
	const key = value.trim().toLowerCase().replace(/[_-]/g, "");
	return labels[key] ?? value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function ModelModalityBadges({
	values,
	unknownLabel,
	modalityLabels,
}: {
	values: string[];
	unknownLabel: string;
	modalityLabels: Record<string, string>;
}) {
	if (!values.length) return <span className="text-xs text-muted-foreground">{unknownLabel}</span>;
	return (
		<div className="flex flex-wrap gap-1">
			{values.map((value) => (
				<Badge key={value} variant="outline" className="text-[11px] font-normal">
					{formatModality(value, modalityLabels)}
				</Badge>
			))}
		</div>
	);
}

function SummaryMetric({
	label,
	value,
	description,
}: {
	label: string;
	value: string;
	description: string;
}) {
	return (
		<div className="space-y-1 rounded-xl border border-border/70 px-4 py-3">
			<p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
				{label}
			</p>
			<p className="text-2xl font-semibold tracking-tight">{value}</p>
			<p className="text-xs text-muted-foreground">{description}</p>
		</div>
	);
}

export default async function FreeRouterOverview() {
	const t = await getTranslations("Catalogue.models.freeRouter");
	const tMetadata = await getTranslations("Catalogue.modelDetail.metadata");
	const locale = await getLocale();
	const overview = await fetchFrontendFreeRouterOverview();
	const modalityLabels = {
		text: tMetadata("modalityText"),
		image: tMetadata("modalityImage"),
		video: tMetadata("modalityVideo"),
		audio: tMetadata("modalityAudio"),
		speech: tMetadata("modalitySpeech"),
		audiospeech: tMetadata("modalitySpeech"),
		audiotts: tMetadata("modalitySpeech"),
		transcription: tMetadata("modalityTranscription"),
		audiostt: tMetadata("modalityTranscription"),
		audiomusic: tMetadata("modalityMusic"),
		embedding: tMetadata("modalityEmbeddings"),
		embeddings: tMetadata("modalityEmbeddings"),
		moderation: tMetadata("modalityModeration"),
		moderations: tMetadata("modalityModeration"),
	};

	return (
		<div className="space-y-8">
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">
						{t.rich("description", {
							routerId: FREE_ROUTER_MODEL_ID,
							code: (chunks) => <span className="font-mono text-foreground">{chunks}</span>,
						})}
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<SummaryMetric
						label={t("eligibleModels")}
						value={formatNumber(overview.summary.eligibleModels, locale)}
						description={t("eligibleModelsDescription")}
					/>
					<SummaryMetric
						label={t("eligibleProviders")}
						value={formatNumber(overview.summary.eligibleProviders, locale)}
						description={t("eligibleProvidersDescription")}
					/>
					<SummaryMetric
						label={t("requests30d")}
						value={formatNumber(overview.summary.routedRequests30d, locale)}
						description={t("requestsDescription")}
					/>
					<SummaryMetric
						label={t("spend30d")}
						value={formatCostNanos(overview.summary.totalCostNanos30d, locale)}
						description={t("spendDescription")}
					/>
				</div>
			</section>

			<section className="space-y-3 border-t border-border/60 pt-6">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold tracking-tight">{t("eligibleModelsTitle")}</h2>
					<p className="text-sm text-muted-foreground">
						{t("eligibleModelsTableDescription")}
					</p>
				</div>
				{overview.models.length > 0 ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("model")}</TableHead>
								<TableHead>{t("providers")}</TableHead>
								<TableHead>{tMetadata("input")}</TableHead>
								<TableHead>{tMetadata("output")}</TableHead>
								<TableHead className="text-right">{t("requests30d")}</TableHead>
								<TableHead className="text-right">{t("spend30d")}</TableHead>
								<TableHead className="text-right">{t("lastRouted")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{overview.models.map((model) => (
								<TableRow key={model.modelId}>
									<TableCell className="min-w-[220px]">
										<div className="space-y-1">
											<Link
												href={`/models/${model.modelId}`}
												className="font-medium underline-offset-4 hover:underline"
											>
												{model.organisationName}: {model.name}
											</Link>
											<p className="text-xs text-muted-foreground">{model.displayApiModelId}</p>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline">{model.providerCount}</Badge>
									</TableCell>
									<TableCell>
										<ModelModalityBadges values={model.inputModalities} unknownLabel={t("unknown")} modalityLabels={modalityLabels} />
									</TableCell>
									<TableCell>
										<ModelModalityBadges values={model.outputModalities} unknownLabel={t("unknown")} modalityLabels={modalityLabels} />
									</TableCell>
					<TableCell className="text-right font-mono">
						{formatNumber(model.usage.requests30d, locale)}
					</TableCell>
					<TableCell className="text-right font-mono">
						{formatCostNanos(model.usage.totalCostNanos30d, locale)}
									</TableCell>
									<TableCell className="text-right text-sm text-muted-foreground">
										{formatDate(model.usage.lastRoutedAt, locale, t("never"))}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<Empty className="rounded-lg border p-8">
						<EmptyHeader>
							<EmptyTitle>{t("noEligibleTitle")}</EmptyTitle>
							<EmptyDescription>
								{t("noEligibleDescription")}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</section>
		</div>
	);
}
