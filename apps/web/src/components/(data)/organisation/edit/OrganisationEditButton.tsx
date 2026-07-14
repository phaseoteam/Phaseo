import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

interface OrganisationEditButtonProps {
  organisationId: string;
}

export default async function OrganisationEditButton({
  organisationId,
}: OrganisationEditButtonProps) {
  const authStatus = await fetchInternalAuthStatus().catch(() => ({
    isAdmin: false,
    signedIn: false,
  }));

  if (!authStatus.isAdmin) {
    return null;
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        href={`/internal/data/organisations/${organisationId}/edit`}
        aria-label="Edit organisation"
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </Button>
  );
}
