import { use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ProviderForm } from "@/components/(data)/providers/edit/ProviderForm";
import { adminProviderFormOptionsQuery } from "../../catalog.functions";

export default function NewAPIProviderPage({ searchParams }: { searchParams: Promise<{ scope?: string; parent?: string }> }) {
  const t = useTranslations("Product.internalTools.dataEditor");
  const params = use(searchParams);
  const { data: options } = useSuspenseQuery(adminProviderFormOptionsQuery());
  return <div className="container mx-auto space-y-6 py-8"><h1 className="text-2xl font-semibold">{t("providerCreateTitle")}</h1><ProviderForm options={options} initialScope={params.scope === "regional" ? "regional" : "global"} initialParent={params.parent} /></div>;
}
