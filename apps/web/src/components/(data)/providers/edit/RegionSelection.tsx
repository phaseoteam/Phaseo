"use client";
import { Globe2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

export const REGION_NAMES: Record<string, string> = {
  global: "Global", us: "United States", eu: "European Union", apac: "Asia Pacific", ap: "Asia Pacific", au: "Australia", cn: "China", fr: "France", id: "Indonesia", il: "Israel", in: "India", jp: "Japan", my: "Malaysia", nl: "Netherlands", se: "Sweden", sg: "Singapore", gb: "United Kingdom",
};
export function RegionSelection({ label, value, options, onChange, disabled = false }: {
  label: string; value: string[]; options: Array<{ region_code: string; display_name: string | null }>; onChange: (value: string[]) => void; disabled?: boolean;
}) {
  const names = new Map(Object.entries(REGION_NAMES));
  for (const option of options) names.set(option.region_code.toLowerCase(), REGION_NAMES[option.region_code.toLowerCase()] || option.display_name || option.region_code);
  for (const region of value) if (!names.has(region.toLowerCase())) names.set(region.toLowerCase(), region);
  const selected = [...new Set(value.map((region) => region.toLowerCase()))];
  return <div className="space-y-2"><div className="text-sm font-medium">{label}</div>
    <div className="flex flex-wrap gap-2">{selected.map((region) => <Button key={region} type="button" size="sm" variant="secondary" disabled={disabled} aria-label={`Remove ${names.get(region)} from ${label.toLowerCase()}`} onClick={() => onChange(selected.filter((item) => item !== region))}><Globe2 className="size-3.5" aria-hidden />{names.get(region)}<X className="size-3" aria-hidden /></Button>)}</div>
    <SearchableSelect label={label} placeholder="Add region…" value="" disabled={disabled} options={[...names].filter(([code]) => !selected.includes(code)).map(([code, name]) => ({ value: code, label: name, icon: <Globe2 className="size-4 shrink-0" aria-hidden /> }))} onValueChange={(region) => onChange([...selected, region])} />
  </div>;
}
