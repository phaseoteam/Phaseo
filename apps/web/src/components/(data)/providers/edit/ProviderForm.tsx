"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { UnsavedChangesGuard } from "@/components/(data)/UnsavedChangesGuard";
import { useRouter } from "next/navigation";
import { Globe2, Network, Plus, Plug, FileText, ShieldCheck, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createAPIProviderAction, updateAPIProviderAction } from "@/app/(dashboard)/internal/data/actions";
import type { ProviderFormOptions } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { PROVIDER_PROMPT_TRAINING_POLICY_LABELS, PROVIDER_PROMPT_TRAINING_POLICY_VALUES } from "@/lib/providers/promptTrainingPolicy";
import { CatalogCountryField } from "@/components/(data)/CatalogCountryField";
import { RegionSelection, REGION_NAMES } from "./RegionSelection";

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
      toast.success(provider ? "Provider saved." : "Provider created. Add it to a model from the model’s Providers tab.");
      router.push(`/internal/data/api-providers/${encodeURIComponent(slug.trim())}/edit`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to save provider."); }
    finally { setBusy(false); }
  };
  return <form ref={(element) => { formRef.current = element; if (element && baseline.current === null) baseline.current = JSON.stringify(Array.from(new FormData(element).entries())); }} action={save} className="max-w-3xl space-y-8">
    <UnsavedChangesGuard dirty={() => baseline.current !== null && formSnapshot() !== baseline.current} saving={busy} allowNavigation={() => saved.current} />
    <fieldset disabled={busy} className="space-y-6">
      <h2 className="flex items-center gap-2 font-medium"><Network className="size-4 text-muted-foreground" />Provider details</h2>
      <div className="space-y-2"><label className="text-sm font-medium">Offer type</label><SearchableSelect label="Offer type" value={scope} options={[{ value: "global", label: "Standard provider", icon: <Network className="size-4" /> }, { value: "regional", label: "Regional provider", icon: <Globe2 className="size-4" /> }, { value: "specialized", label: "Specialized offer", icon: <Plus className="size-4" /> }]} onValueChange={setScope} /><input type="hidden" name="offer_scope" value={scope} /></div>
      {scope !== "global" ? <div className="space-y-2"><label className="text-sm font-medium">Parent provider</label><SearchableSelect label="Parent provider" value={parent} options={parents.map((item) => ({ value: item.provider_slug, label: [item.name, item.offer_label].filter(Boolean).join(" · "), icon: <Logo id={item.provider_family_slug || item.provider_slug} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> }))} onValueChange={(value) => { setParent(value); if (!provider) { setName(options.providers.find((item) => item.provider_slug === value)?.name || ""); if (primaryRegion) setSlug(`${value}-${primaryRegion}`); } }} /><input type="hidden" name="parent_provider_slug" value={parent} /></div> : null}
      {!provider && scope === "regional" ? <div className="space-y-2"><label className="text-sm font-medium">Region</label><SearchableSelect label="Region" value={primaryRegion} options={Object.entries(REGION_NAMES).filter(([code]) => code !== "global" && code !== "ap").map(([value, label]) => ({ value, label }))} onValueChange={chooseRegion} /></div> : null}
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Provider name<Input name="api_provider_name" value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="space-y-2 text-sm font-medium">Provider ID<Input name="api_provider_id" value={slug} onChange={(event) => setSlug(event.target.value)} required readOnly={Boolean(provider)} pattern="[a-z0-9][a-z0-9._-]*" className="font-mono" /></label></div>
      {scope !== "global" || provider?.offer_label ? <label className="block space-y-2 text-sm font-medium">Offer label<Input name="offer_label" value={offerLabel} onChange={(event) => setOfferLabel(event.target.value)} required={scope === "regional"} /></label> : <input type="hidden" name="offer_label" value="" />}
      {duplicate ? <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">This provider already exists. <Link className="underline" href={`/internal/data/api-providers/${duplicate.provider_slug}/edit`}>Edit {[duplicate.name, duplicate.offer_label].filter(Boolean).join(" · ")}</Link></p> : null}
      <section className="space-y-4 border-t pt-5"><h2 className="flex items-center gap-2 font-medium"><Globe2 className="size-4" />Regions</h2>
        <RegionSelection label="Execution regions" value={execution} options={options.regions.filter((item) => item.provider_slug === (parent || slug))} onChange={setExecution} />
        <RegionSelection label="Data residency regions" value={dataRegions} options={options.regions.filter((item) => item.provider_slug === (parent || slug))} onChange={setDataRegions} />
        <input type="hidden" name="default_execution_regions" value={execution.join(",")} /><input type="hidden" name="default_data_regions" value={dataRegions.join(",")} />
        <div className="space-y-2"><label className="text-sm font-medium">Region control</label><SearchableSelect label="Region control" value={mode} options={[{ value: "unknown", label: "Not confirmed" }, { value: "provider_managed", label: "Fixed by provider" }, { value: "customer_selectable", label: "Selected per request" }, { value: "account_selected", label: "Fixed by account" }]} onValueChange={setMode} /><input type="hidden" name="residency_mode" value={mode} /></div>
      </section>
      <section className="space-y-4 border-t pt-5"><h2 className="flex items-center gap-2 font-medium"><Plug className="size-4 text-muted-foreground" />Connection</h2><label className="block space-y-2 text-sm font-medium">API base URL<Input name="base_url" type="url" defaultValue={provider?.base_url ?? ""} placeholder="https://…" /></label>
        <p className="text-xs text-muted-foreground">Register the offer here, then attach it to models. Gateway integration and credentials are configured separately; new offers start with routing off.</p>
        {provider ? <p className="text-sm text-muted-foreground">Gateway: {provider.routing_enabled && provider.routable ? "Enabled" : "Not enabled"}</p> : null}
        <div className="space-y-2"><label className="text-sm font-medium">Catalog status</label><SearchableSelect label="Catalog status" value={status} options={[...new Set(["active", "beta", "alpha", "not_ready", "deprecated", "disabled", ...(provider?.status ? [provider.status] : [])])].map((value) => ({ value, label: value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) }))} onValueChange={setStatus} /><input type="hidden" name="status" value={status} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="byok_available" defaultChecked={provider?.byok_available} />BYOK available</label>
      </section>
      <section className="space-y-4 border-t pt-5"><h2 className="flex items-center gap-2 font-medium"><FileText className="size-4 text-muted-foreground" />About</h2><label className="block space-y-2 text-sm font-medium">Description<Textarea name="description" defaultValue={provider?.description || ""} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Website<Input name="link" type="url" defaultValue={provider?.link || ""} /></label><CatalogCountryField defaultValue={provider?.country_code || ""} /><label className="space-y-2 text-sm font-medium">Subdivision code<Input name="subdivision_code" defaultValue={provider?.subdivision_code || ""} placeholder="US-CA" className="font-mono" /></label></div>
      </section>
      <section className="space-y-4 border-t pt-6"><h2 className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-muted-foreground" />Data policy</h2>
        <div className="space-y-2"><label className="text-sm font-medium">Prompt training policy</label><SearchableSelect label="Prompt training policy" value={policy} options={PROVIDER_PROMPT_TRAINING_POLICY_VALUES.map((value) => ({ value, label: PROVIDER_PROMPT_TRAINING_POLICY_LABELS[value] }))} onValueChange={setPolicy} /><input type="hidden" name="prompt_training_policy" value={policy} /></div>
        <label className="block space-y-2 text-sm font-medium">Policy source URL<Input name="prompt_training_source_url" type="url" defaultValue={provider?.prompt_training_source_url || ""} /></label><label className="block space-y-2 text-sm font-medium">Policy notes<Textarea name="prompt_training_notes" defaultValue={provider?.prompt_training_notes || ""} /></label>
        {["data_policy_tier", "data_policy_confidence", "data_policy_contract_mode", "data_policy_contract_notes"].map((key) => <input key={key} type="hidden" name={key} value={String(provider?.metadata?.[key] || "")} />)}
      </section>
    </fieldset>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background/95 py-4 backdrop-blur-sm"><Button type="submit" disabled={busy || Boolean(duplicate) || (scope === "regional" && (!parent && !provider || !execution.length || execution.some((region) => region.toLowerCase() === "global") || !offerLabel.trim()))}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{busy ? "Saving…" : provider ? "Save provider" : "Create provider"}</Button><Button variant="ghost" asChild><Link href="/internal/data/api-providers">Back to providers</Link></Button>{parentRow ? <span className="ml-auto text-xs text-muted-foreground">{parentRow.name} family</span> : null}</div>
  </form>;
}
