"use client";
import { localizedInternalCatalogError } from "@/i18n/internal-catalog-errors";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation";
import { useRef, useState } from "react";
import { UnsavedChangesGuard } from "@/components/(data)/UnsavedChangesGuard";
import { useLocale } from "next-intl";
import { Globe2, Network, Plus, Plug, FileText, ShieldCheck, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createAPIProviderAction, updateAPIProviderAction } from "@/app/(dashboard)/internal/data/actions";
import type { ProviderFormOptions } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { PROVIDER_PROMPT_TRAINING_POLICY_VALUES } from "@/lib/providers/promptTrainingPolicy";
import { CatalogCountryField } from "@/components/(data)/CatalogCountryField";
import { RegionSelection, REGION_NAMES, regionDisplayName } from "./RegionSelection";

type ProviderRecord = {
  api_provider_id: string; api_provider_name: string; provider_family_slug?: string | null;
  offer_scope?: string; offer_label?: string | null; residency_mode?: string;
  default_execution_regions?: string[] | null; default_data_regions?: string[] | null;
  base_url?: string | null; link?: string | null; country_code?: string | null; subdivision_code?: string | null; description?: string | null;
  byok_available?: boolean; status?: string; routing_enabled?: boolean; routable?: boolean;
  prompt_training_policy?: string | null; prompt_training_notes?: string | null; prompt_training_source_url?: string | null;
  metadata?: Record<string, unknown>;
};

export function ProviderForm({ provider, options, initialScope = "global", initialParent = "" }: {
  provider?: ProviderRecord; options: ProviderFormOptions; initialScope?: string; initialParent?: string;
}) {
  const tx = useTranslations();
  const locale = useLocale();
  const regionLabels = { global: tx("Common.ui.status.global" as never), asiaPacific: tx("Common.ui.pricingEditorCopy.asiaPacific" as never) };
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const baseline = useRef<string | null>(null);
  const saved = useRef(false);
  const formSnapshot = () => formRef.current ? JSON.stringify(Array.from(new FormData(formRef.current).entries())) : null;
  const [scope, setScope] = useState(provider?.offer_scope || initialScope);
  const familyParent = provider?.provider_family_slug ? options.providers.find((item) => item.provider_slug !== provider.api_provider_id && item.offer_scope === "global" && (item.provider_slug === provider.provider_family_slug || item.provider_family_slug === provider.provider_family_slug)) : undefined;
  const [parent, setParent] = useState(String(provider?.metadata?.parent_provider_slug || familyParent?.provider_slug || initialParent));
  const initialParentRow = options.providers.find((item) => item.provider_slug === initialParent);
  const [name, setName] = useState(provider?.api_provider_name || initialParentRow?.name || "");
  const [slug, setSlug] = useState(provider?.api_provider_id || "");
  const [offerLabel, setOfferLabel] = useState(provider?.offer_label || "");
  const [primaryRegion, setPrimaryRegion] = useState("");
  const [execution, setExecution] = useState(provider?.default_execution_regions ?? []);
  const [dataRegions, setDataRegions] = useState(provider?.default_data_regions ?? []);
  const [mode, setMode] = useState(provider?.residency_mode || "unknown");
  const [status, setStatus] = useState(provider?.status || "active");
  const [policy, setPolicy] = useState(provider?.prompt_training_policy || "unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parents = options.providers.filter((item) => item.provider_slug !== provider?.api_provider_id && item.offer_scope !== "regional");
  const duplicate = !provider && options.providers.find((item) => item.provider_slug === slug.trim());
  const parentRow = options.providers.find((item) => item.provider_slug === parent);
  const chooseRegion = (region: string) => {
    setPrimaryRegion(region); setExecution([region]); setDataRegions([region]); setMode("provider_managed");
    setOfferLabel(REGION_NAMES[region] || region);
    if (parent) setSlug(`${parent}-${region}`);
  };
  const save = async (form: FormData) => {
    setBusy(true); setError(null);
    try {
      if (provider) await updateAPIProviderAction(provider.api_provider_id, form);
      else await createAPIProviderAction(form);
      saved.current = true;
      toast.success(provider ? tx("Common.ui.pricingEditorCopy.providerSaved" as never) : tx("Common.ui.pricingEditorCopy.providerCreatedAddItToAModelFromTheModelSProvidersTab" as never));
      router.push(`/internal/data/api-providers/${encodeURIComponent(slug.trim())}/edit`); router.refresh();
    } catch (cause) { setError(localizedInternalCatalogError(cause, tx, "Common.ui.pricingEditorCopy.failedToSaveProvider")); }
    finally { setBusy(false); }
  };
  return <form ref={(element) => { formRef.current = element; if (element && baseline.current === null) baseline.current = JSON.stringify(Array.from(new FormData(element).entries())); }} action={save} className="max-w-3xl space-y-8">
    <UnsavedChangesGuard dirty={() => baseline.current !== null && formSnapshot() !== baseline.current} saving={busy} allowNavigation={() => saved.current} />
    <fieldset disabled={busy} className="space-y-6">
      <h2 className="flex items-center gap-2 font-medium"><Network className="size-4 text-muted-foreground" />{tx("Common.ui.auditDataTable.providerDetails" as never)}</h2>
      <div className="space-y-2"><label className="text-sm font-medium">{tx("Common.ui.pricingEditorCopy.offerType" as never)}</label><SearchableSelect label={tx("Common.ui.pricingEditorCopy.offerType" as never)} value={scope} options={[{ value: "global", label: tx("Common.ui.pricingEditorCopy.standardProvider" as never), icon: <Network className="size-4" /> }, { value: "regional", label: tx("Common.ui.pricingEditorCopy.regionalProvider" as never), icon: <Globe2 className="size-4" /> }, { value: "specialized", label: tx("Common.ui.pricingEditorCopy.specializedOffer" as never), icon: <Plus className="size-4" /> }]} onValueChange={setScope} /><input type="hidden" name="offer_scope" value={scope} /></div>
      {scope !== "global" ? <div className="space-y-2"><label className="text-sm font-medium">{tx("Common.ui.pricingEditorCopy.parentProvider" as never)}</label><SearchableSelect label={tx("Common.ui.pricingEditorCopy.parentProvider" as never)} value={parent} options={parents.map((item) => ({ value: item.provider_slug, label: [item.name, item.offer_label].filter(Boolean).join(" · "), icon: <Logo id={item.provider_family_slug || item.provider_slug} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> }))} onValueChange={(value) => { setParent(value); if (!provider) { setName(options.providers.find((item) => item.provider_slug === value)?.name || ""); if (primaryRegion) setSlug(`${value}-${primaryRegion}`); } }} /><input type="hidden" name="parent_provider_slug" value={parent} /></div> : null}
      {!provider && scope === "regional" ? <div className="space-y-2"><label className="text-sm font-medium">{tx("Common.ui.versionedPricing.region" as never)}</label><SearchableSelect label={tx("Common.ui.versionedPricing.region" as never)} value={primaryRegion} options={Object.entries(REGION_NAMES).filter(([code]) => code !== "global" && code !== "ap").map(([value]) => ({ value, label: regionDisplayName(value, locale, regionLabels) }))} onValueChange={chooseRegion} /></div> : null}
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">{tx("Product.internalTools.dataEditor.providerName" as never)}<Input name="api_provider_name" value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="space-y-2 text-sm font-medium">{tx("Product.internalTools.dataEditor.providerId" as never)}<Input name="api_provider_id" value={slug} onChange={(event) => setSlug(event.target.value)} required readOnly={Boolean(provider)} pattern="[a-z0-9][a-z0-9._-]*" className="font-mono" /></label></div>
      {scope !== "global" || provider?.offer_label ? <label className="block space-y-2 text-sm font-medium">{tx("Common.ui.versionedPricing.offerLabel" as never)}<Input name="offer_label" value={offerLabel} onChange={(event) => setOfferLabel(event.target.value)} required={scope === "regional"} /></label> : <input type="hidden" name="offer_label" value="" />}
      {duplicate ? <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">{tx("Common.ui.pricingEditorCopy.thisProviderAlreadyExists" as never)} <Link className="underline" href={`/internal/data/api-providers/${duplicate.provider_slug}/edit`}>{tx("Common.ui.actions.edit" as never)} {[duplicate.name, duplicate.offer_label].filter(Boolean).join(" · ")}</Link></p> : null}
      <section className="space-y-4 border-t pt-5"><h2 className="flex items-center gap-2 font-medium"><Globe2 className="size-4" />{tx("Common.ui.pricingEditorCopy.regions" as never)}</h2>
        <RegionSelection label={tx("Common.ui.pricingEditorCopy.executionRegions" as never)} value={execution} options={options.regions.filter((item) => item.provider_slug === (parent || slug))} onChange={setExecution} />
        <RegionSelection label={tx("Common.ui.pricingEditorCopy.dataResidencyRegions" as never)} value={dataRegions} options={options.regions.filter((item) => item.provider_slug === (parent || slug))} onChange={setDataRegions} />
        <input type="hidden" name="default_execution_regions" value={execution.join(",")} /><input type="hidden" name="default_data_regions" value={dataRegions.join(",")} />
        <div className="space-y-2"><label className="text-sm font-medium">{tx("Common.ui.pricingEditorCopy.regionControl" as never)}</label><SearchableSelect label={tx("Common.ui.pricingEditorCopy.regionControl" as never)} value={mode} options={[{ value: "unknown", label: tx("Common.ui.pricingEditorCopy.notConfirmed" as never) }, { value: "provider_managed", label: tx("Common.ui.pricingEditorCopy.fixedByProvider" as never) }, { value: "customer_selectable", label: tx("Common.ui.pricingEditorCopy.selectedPerRequest" as never) }, { value: "account_selected", label: tx("Common.ui.pricingEditorCopy.fixedByAccount" as never) }]} onValueChange={setMode} /><input type="hidden" name="residency_mode" value={mode} /></div>
      </section>
      <section className="space-y-4 border-t pt-5"><h2 className="flex items-center gap-2 font-medium"><Plug className="size-4 text-muted-foreground" />{tx("SettingsUI.broadcastControls.connection" as never)}</h2><label className="block space-y-2 text-sm font-medium">{tx("Common.ui.pricingEditorCopy.aPIBaseURL" as never)}<Input name="base_url" type="url" defaultValue={provider?.base_url ?? ""} placeholder="https://…" /></label>
        <p className="text-xs text-muted-foreground">{tx("Common.ui.pricingEditorCopy.registerTheOfferHereThenAttachItToModelsGatewayIntegrationAndCredentialsAreConfiguredSeparatelyNewOffersStartWithRoutingOff" as never)}</p>
        {provider ? <p className="text-sm text-muted-foreground">{tx("Common.ui.pricingEditorCopy.gatewayStatus", { status: provider.routing_enabled && provider.routable ? tx("Common.ui.modelEditor.advanced.enabled" as never) : tx("Common.ui.pricingEditorCopy.notEnabled" as never) })}</p> : null}
        <div className="space-y-2"><label className="text-sm font-medium">{tx("Common.ui.pricingEditorCopy.catalogStatus" as never)}</label><SearchableSelect label={tx("Common.ui.pricingEditorCopy.catalogStatus" as never)} value={status} options={[...new Set(["active", "beta", "alpha", "not_ready", "deprecated", "disabled", ...(provider?.status ? [provider.status] : [])])].map((value) => ({ value, label: ({"active":"Common.ui.modelEditor.modelStatuses.active","beta":"Common.ui.modelEditor.modelStatuses.beta","alpha":"SettingsUI.oauthAppsPage.alphaLabel","not_ready":"SettingsUI.identity.availability.not_ready","deprecated":"Common.ui.modelEditor.modelStatuses.deprecated","disabled":"Common.ui.modelEditor.capabilityStatuses.disabled"} as Record<string, string>)[value] ? tx(({"active":"Common.ui.modelEditor.modelStatuses.active","beta":"Common.ui.modelEditor.modelStatuses.beta","alpha":"SettingsUI.oauthAppsPage.alphaLabel","not_ready":"SettingsUI.identity.availability.not_ready","deprecated":"Common.ui.modelEditor.modelStatuses.deprecated","disabled":"Common.ui.modelEditor.capabilityStatuses.disabled"} as Record<string, string>)[value] as never) : value }))} onValueChange={setStatus} /><input type="hidden" name="status" value={status} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="byok_available" defaultChecked={provider?.byok_available} />{tx("Catalogue.providers.byokAvailable" as never)}</label>
      </section>
      <section className="space-y-4 border-t pt-5"><h2 className="flex items-center gap-2 font-medium"><FileText className="size-4 text-muted-foreground" />{tx("Common.footer.about" as never)}</h2><label className="block space-y-2 text-sm font-medium">{tx("Catalogue.models.detail.quickstart.descriptionLabel" as never)}<Textarea name="description" defaultValue={provider?.description || ""} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">{tx("Catalogue.modelDetail.metadata.website" as never)}<Input name="link" type="url" defaultValue={provider?.link || ""} /></label><CatalogCountryField defaultValue={provider?.country_code || ""} /><label className="space-y-2 text-sm font-medium">{tx("Product.internalTools.dataEditor.subdivisionCode" as never)}<Input name="subdivision_code" defaultValue={provider?.subdivision_code || ""} placeholder="US-CA" className="font-mono" /></label></div>
      </section>
      <section className="space-y-4 border-t pt-6"><h2 className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-muted-foreground" />{tx("Common.ui.modelEditor.providerControls.dataPolicy" as never)}</h2>
        <div className="space-y-2"><label className="text-sm font-medium">{tx("Product.internalTools.dataEditor.promptTrainingPolicy" as never)}</label><SearchableSelect label={tx("Product.internalTools.dataEditor.promptTrainingPolicy" as never)} value={policy} options={PROVIDER_PROMPT_TRAINING_POLICY_VALUES.map((value) => ({ value, label: tx(({ "unknown": "Product.internalTools.dataEditor.policyUnknown", "may_train": "Product.internalTools.dataEditor.policyMayTrain", "no_train": "Product.internalTools.dataEditor.policyNoTrain", "opt_out_available": "Product.internalTools.dataEditor.policyOptOut", "enterprise_no_train": "Product.internalTools.dataEditor.policyEnterpriseNoTrain" })[value] as never) }))} onValueChange={setPolicy} /><input type="hidden" name="prompt_training_policy" value={policy} /></div>
        <label className="block space-y-2 text-sm font-medium">{tx("Product.internalTools.dataEditor.policySourceUrl" as never)}<Input name="prompt_training_source_url" type="url" defaultValue={provider?.prompt_training_source_url || ""} /></label><label className="block space-y-2 text-sm font-medium">{tx("Product.internalTools.dataEditor.policyNotes" as never)}<Textarea name="prompt_training_notes" defaultValue={provider?.prompt_training_notes || ""} /></label>
        {["data_policy_tier", "data_policy_confidence", "data_policy_contract_mode", "data_policy_contract_notes"].map((key) => <input key={key} type="hidden" name={key} value={String(provider?.metadata?.[key] || "")} />)}
      </section>
    </fieldset>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background/95 py-4 backdrop-blur-sm"><Button type="submit" disabled={busy || Boolean(duplicate) || (scope === "regional" && (!parent && !provider || !execution.length || execution.some((region) => region.toLowerCase() === "global") || !offerLabel.trim()))}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{busy ? tx("Common.ui.versionedPricing.saving" as never) : provider ? tx("Common.ui.pricingEditorCopy.saveProvider" as never) : tx("Common.ui.pricingEditorCopy.createProvider" as never)}</Button><Button variant="ghost" asChild><Link href="/internal/data/api-providers">{tx("Common.ui.pricingEditorCopy.backToProviders" as never)}</Link></Button>{parentRow ? <span className="ml-auto text-xs text-muted-foreground">{tx("Common.ui.pricingEditorCopy.providerFamily", { provider: parentRow.name })}</span> : null}</div>
  </form>;
}
