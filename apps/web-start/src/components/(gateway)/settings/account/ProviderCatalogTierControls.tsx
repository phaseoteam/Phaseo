"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProviderManagedCatalogModel } from "@/app/(dashboard)/settings/account/providers/actions";

type Tier = NonNullable<ProviderManagedCatalogModel["service_tiers"]>[number];
const names = ["standard", "fast", "ultrafast", "flex", "batch"] as const;

export default function ProviderCatalogTierControls({ model, activeTier, onSelect, onChange }: {
	model: ProviderManagedCatalogModel; activeTier: string; onSelect: (name: string) => void; onChange: (tiers: Tier[]) => void;
}) {
	const t = useTranslations("SettingsUI.providerCatalogCopy");
	const tiers = model.service_tiers ?? [{ service_tier: "standard" as const, provider_model_slug: model.provider_model_slug, pricing: model.pricing, availability: model.availability }];
	const selected = tiers.find((tier) => tier.service_tier === activeTier) ?? tiers[0];
	return <div className="grid gap-3 py-3 sm:grid-cols-2">
		<div className="space-y-2"><Label htmlFor="catalog-service-tier">{t("serviceTier")}</Label><Select value={selected.service_tier} onValueChange={onSelect}>
			<SelectTrigger id="catalog-service-tier" className="w-full"><SelectValue>{selected.service_tier}</SelectValue></SelectTrigger><SelectContent>{tiers.map((tier) => <SelectItem key={tier.service_tier} value={tier.service_tier}>{tier.service_tier}</SelectItem>)}</SelectContent>
		</Select></div>
		<div className="space-y-2"><Label htmlFor="catalog-add-tier">{t("addTier")}</Label><Select value="" disabled={tiers.length === names.length} onValueChange={(value) => {
			if (!value) return;
			onChange([...tiers, { service_tier: value as Tier["service_tier"], provider_model_slug: "", availability: "not_ready", pricing: (tiers.find((tier) => tier.service_tier === "standard")?.pricing ?? model.pricing).map((price) => ({ ...price })) }]);
			onSelect(value);
		}}><SelectTrigger id="catalog-add-tier" className="w-full"><SelectValue>{t("addTier")}</SelectValue></SelectTrigger><SelectContent>{names.filter((name) => !tiers.some((tier) => tier.service_tier === name)).map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div>
		{model.service_tiers && <div className="space-y-2"><Label htmlFor="catalog-upstream-tier">{t("upstreamTier")}</Label><Select value={selected.upstream_service_tier ?? "model_id"} onValueChange={(value) => onChange(tiers.map((tier) => tier.service_tier === selected.service_tier ? { ...tier, upstream_service_tier: value === "model_id" ? null : value } : tier))}>
			<SelectTrigger id="catalog-upstream-tier" className="w-full"><SelectValue>{selected.upstream_service_tier ?? t("modelIdSelection")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="model_id">{t("modelIdSelection")}</SelectItem>
			{(selected.service_tier === "batch" ? [] : selected.service_tier === "standard" ? ["default", "standard"] : selected.service_tier === "fast" ? ["fast", "priority"] : [selected.service_tier]).map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
		</SelectContent></Select></div>}
		{selected.service_tier !== "standard" && <Button type="button" variant="ghost" onClick={() => { onChange(tiers.filter((tier) => tier !== selected)); onSelect("standard"); }}>{t("removeTier")}</Button>}
	</div>;
}
