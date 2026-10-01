import { getTranslations } from "next-intl/server";
import { BenchmarkForm } from "@/components/(data)/BenchmarkForm";
import { createBenchmarkAction } from "../../actions";

export default async function NewBenchmarkPage() {
  const t = await getTranslations("Product.internalTools.dataEditor");

  return <div className="container mx-auto space-y-8 py-8"><h1 className="text-2xl font-semibold">{t("benchmarkCreateTitle")}</h1><BenchmarkForm action={createBenchmarkAction} /></div>;
}
