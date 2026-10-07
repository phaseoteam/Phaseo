"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ProviderManagedCatalogModel } from "@/app/(dashboard)/settings/account/providers/actions";

type Tier = NonNullable<ProviderManagedCatalogModel["service_tiers"]>[number];
const names = ["standard", "fast", "ultrafast", "flex", "batch"] as const;
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function ProviderCatalogTierControls({ model, activeTier, onSelect, onChange }: {
	model: ProviderManagedCatalogModel; activeTier: string; onSelect: (name: string) => void; onChange: (tiers: Tier[]) => void;
}) {
	const t = useTranslations("SettingsUI.providerCatalogCopy");
	const tiers = model.service_tiers ?? [{ service_tier: "standard" as const, provider_model_slug: model.provider_model_slug, pricing: model.pricing, availability: model.availability }];
	const selected = tiers.find((tier) => tier.service_tier === activeTier) ?? tiers[0];
	return <div className="grid gap-3 py-3 sm:grid-cols-2">
		<div className="space-y-2"><Label htmlFor="catalog-service-tier">{t("serviceTier")}</Label><select id="catalog-service-tier" className={selectClass} value={selected.service_tier} onChange={(event) => onSelect(event.target.value)}>
			{tiers.map((tier) => <option key={tier.service_tier} value={tier.service_tier}>{tier.service_tier}</option>)}
		</select></div>
		<div className="space-y-2"><Label htmlFor="catalog-add-tier">{t("addTier")}</Label><select id="catalog-add-tier" className={selectClass} value="" onChange={(event) => {
			if (!event.target.value) return;
			onChange([...tiers, { service_tier: event.target.value as Tier["service_tier"], provider_model_slug: "", availability: "not_ready", pricing: (tiers.find((tier) => tier.service_tier === "standard")?.pricing ?? model.pricing).map((price) => ({ ...price })) }]);
			onSelect(event.target.value);
		}}><option value="">{t("addTier")}</option>{names.filter((name) => !tiers.some((tier) => tier.service_tier === name)).map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
		{model.service_tiers && <div className="space-y-2"><Label htmlFor="catalog-upstream-tier">{t("upstreamTier")}</Label><select id="catalog-upstream-tier" className={selectClass} value={selected.upstream_service_tier ?? ""} onChange={(event) => onChange(tiers.map((tier) => tier.service_tier === selected.service_tier ? { ...tier, upstream_service_tier: event.target.value || null } : tier))}>
			<option value="">{t("modelIdSelection")}</option>
			{(selected.service_tier === "batch" ? [] : selected.service_tier === "standard" ? ["default", "standard"] : selected.service_tier === "fast" ? ["fast", "priority"] : [selected.service_tier]).map((name) => <option key={name} value={name}>{name}</option>)}
		</select></div>}
		{selected.service_tier !== "standard" && <Button type="button" variant="ghost" onClick={() => { onChange(tiers.filter((tier) => tier !== selected)); onSelect("standard"); }}>{t("removeTier")}</Button>}
	</div>;
}
