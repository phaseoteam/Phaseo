import { Pencil } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { CatalogIssueButton } from "@/components/(data)/CatalogIssueButton";
import { Button } from "@/components/ui/button";
import Link from "@/components/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogueInternalAuthStatusQuery } from "@/components/(data)/catalogueViewer.functions";

interface OrganisationEditButtonProps {
  organisationId: string;
}

export default function OrganisationEditButton({
  organisationId,
}: OrganisationEditButtonProps) {
  const { data: authStatus } = useSuspenseQuery(catalogueInternalAuthStatusQuery());
  const t = useTranslations("Catalogue.organisations");

  if (!authStatus.isAdmin) {
    return <CatalogIssueButton entity="Organisation" id={organisationId} />;
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        href={`/internal/data/organisations/${organisationId}/edit`}
        aria-label={t("editOrganisation")}
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </Button>
  );
}
