import { Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CatalogIssueButton } from "@/components/(data)/CatalogIssueButton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

interface BenchmarkEditButtonProps {
  benchmarkId: string;
  compactMobile?: boolean;
}

export default async function BenchmarkEditButton({
  benchmarkId,
  compactMobile,
}: BenchmarkEditButtonProps) {
	const t = await getTranslations("Catalogue.benchmarks");
  const authStatus = await fetchInternalAuthStatus().catch(() => ({
    isAdmin: false,
    signedIn: false,
  }));

  if (!authStatus.isAdmin) {
    return <CatalogIssueButton entity="Benchmark" id={benchmarkId} compactMobile={compactMobile} />;
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        href={`/internal/data/benchmarks/${benchmarkId}/edit`}
        aria-label={t("editBenchmark")}
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </Button>
  );
}
