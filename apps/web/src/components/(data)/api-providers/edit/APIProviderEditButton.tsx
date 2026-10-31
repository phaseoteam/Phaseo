import { Pencil } from "lucide-react";
import { CatalogIssueButton } from "@/components/(data)/CatalogIssueButton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogueInternalAuthStatusQuery } from "@/components/(data)/catalogueViewer.functions";
import { useTranslations } from "next-intl";

interface APIProviderEditButtonProps {
  apiProviderId: string;
}

export default function APIProviderEditButton({
  apiProviderId,
}: APIProviderEditButtonProps) {
  const { data: authStatus } = useSuspenseQuery(catalogueInternalAuthStatusQuery());
  const t = useTranslations("Product.internalTools.dataEditor");

  if (!authStatus.isAdmin) {
    return <CatalogIssueButton entity="API provider" id={apiProviderId} />;
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        href={`/internal/data/api-providers/${apiProviderId}/edit`}
        aria-label={t("providerEditTitle")}
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </Button>
  );
}
