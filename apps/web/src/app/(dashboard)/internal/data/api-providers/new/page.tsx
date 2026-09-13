import { fetchAdminProviderFormOptions } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { ProviderForm } from "@/components/(data)/providers/edit/ProviderForm";

export default async function NewAPIProviderPage({ searchParams }: { searchParams: Promise<{ scope?: string; parent?: string }> }) {
  const [options, params] = await Promise.all([fetchAdminProviderFormOptions(), searchParams]);
  return <div className="container mx-auto space-y-6 py-8"><h1 className="text-2xl font-semibold">Create provider</h1><ProviderForm options={options} initialScope={params.scope === "regional" ? "regional" : "global"} initialParent={params.parent} /></div>;
}
