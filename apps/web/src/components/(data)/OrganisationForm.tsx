import { Building2 } from "lucide-react";
import { CatalogForm } from "./CatalogForm";
import { CatalogCountryField } from "./CatalogCountryField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import OrganisationLinksFieldset from "@/app/(dashboard)/internal/data/organisations/OrganisationLinksFieldset";

type Organisation = { organisation_id: string; name?: string | null; description?: string | null; country_code?: string | null; subdivision_code?: string | null; colour?: string | null };

export function OrganisationForm({ organisation, links = [], action }: { organisation?: Organisation; links?: Array<{ platform: string; url: string }>; action: (form: FormData) => Promise<void> }) {
  return <CatalogForm action={action} className="max-w-3xl space-y-8" submitLabel={organisation ? "Save organisation" : "Create organisation"} backHref="/internal/data/organisations">
    <section className="space-y-5">
      <h2 className="flex items-center gap-2 font-medium"><Building2 className="size-4 text-muted-foreground" />Organisation details</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">Name<Input className="min-h-11" name="name" defaultValue={organisation?.name ?? ""} required /></label>
        <label className="space-y-2 text-sm font-medium">Organisation ID<Input className="min-h-11" name="organisation_id" defaultValue={organisation?.organisation_id ?? ""} required readOnly={Boolean(organisation)} /></label>
        <label className="space-y-2 text-sm font-medium sm:col-span-2">Description<Textarea name="description" defaultValue={organisation?.description ?? ""} className="min-h-28" /></label>
        <CatalogCountryField defaultValue={organisation?.country_code ?? ""} />
        <label className="space-y-2 text-sm font-medium">Subdivision code<Input className="min-h-11 font-mono" name="subdivision_code" defaultValue={organisation?.subdivision_code ?? ""} placeholder="US-CA" /></label>
        <label className="space-y-2 text-sm font-medium">Colour<Input className="min-h-11" name="colour" defaultValue={organisation?.colour ?? ""} placeholder="#0EA5E9" /></label>
      </div>
    </section>
    <OrganisationLinksFieldset initialLinks={links} />
  </CatalogForm>;
}
