import { useSearch } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { ProviderForm } from "@/components/(data)/providers/edit/ProviderForm";
import { adminProviderFormOptionsQuery } from "../../catalog.functions";

export default function NewApiProviderPage() {
  const t = useTranslations("Product.internalTools.dataEditor");
  const params = useSearch({ from: "/{-$locale}/_dashboard/internal/data/api-providers/new/" }) as { scope?: string; parent?: string };
  const { data: options } = useSuspenseQuery(adminProviderFormOptionsQuery());
  return <div className="container mx-auto space-y-6 py-8"><h1 className="text-2xl font-semibold">{t("providerCreateTitle")}</h1><ProviderForm options={options} initialScope={params.scope === "regional" ? "regional" : "global"} initialParent={params.parent} /></div>;
}
