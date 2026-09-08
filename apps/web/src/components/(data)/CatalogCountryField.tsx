"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { COUNTRY_OPTIONS } from "@/lib/countryCodes";

export function CatalogCountryField({ defaultValue = "" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const options = [{ value: "", label: "Not specified" }, ...COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: country.name }))];
  if (value && !options.some((option) => option.value === value)) {
    options.push({ value, label: COUNTRY_OPTIONS.find((country) => country.alpha3 === value.toUpperCase() || country.code === value.toUpperCase())?.name ?? value });
  }
  return <div className="space-y-2"><label htmlFor="catalog-country" className="text-sm font-medium">Country</label><SearchableSelect id="catalog-country" label="Country" value={value} options={options} onValueChange={setValue} /><input type="hidden" name="country_code" value={value} /></div>;
}
