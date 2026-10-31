import { Pencil } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { CatalogIssueButton } from "@/components/(data)/CatalogIssueButton";
import { Button } from "@/components/ui/button";
import Link from "@/components/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogueInternalAuthStatusQuery } from "@/components/(data)/catalogueViewer.functions";

interface BenchmarkEditButtonProps {
  benchmarkId: string;
  compactMobile?: boolean;
}

export default function BenchmarkEditButton({
  benchmarkId,
  compactMobile,
}: BenchmarkEditButtonProps) {
	const t = useTranslations("Catalogue.benchmarks");
  const { data: authStatus } = useSuspenseQuery(catalogueInternalAuthStatusQuery());

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
