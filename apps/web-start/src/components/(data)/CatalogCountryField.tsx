"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { COUNTRY_OPTIONS } from "@/lib/countryCodes";

export function CatalogCountryField({ defaultValue = "" }: { defaultValue?: string }) {
  const locale = useLocale();
  const t = useTranslations("SettingsUI");
  const editorT = useTranslations("Common.ui.modelEditor");
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const [value, setValue] = useState(defaultValue);
  const options = [{ value: "", label: editorT("notSpecified") }, ...COUNTRY_OPTIONS.map((country) => ({ value: country.code, label: regions.of(country.code) ?? country.name }))];
  if (value && !options.some((option) => option.value === value)) {
    const country = COUNTRY_OPTIONS.find((country) => country.alpha3 === value.toUpperCase() || country.code === value.toUpperCase());
    options.push({ value, label: country ? regions.of(country.code) ?? country.name : value });
  }
  return <div className="space-y-2"><label htmlFor="catalog-country" className="text-sm font-medium">{t("strings.Country")}</label><SearchableSelect id="catalog-country" label={t("strings.Country")} value={value} options={options} onValueChange={setValue} /><input type="hidden" name="country_code" value={value} /></div>;
}
