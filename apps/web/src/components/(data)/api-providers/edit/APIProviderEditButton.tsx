import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

interface APIProviderEditButtonProps {
  apiProviderId: string;
}

export default async function APIProviderEditButton({
  apiProviderId,
}: APIProviderEditButtonProps) {
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
        href={`/internal/data/api-providers/${apiProviderId}/edit`}
        aria-label="Edit API provider"
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </Button>
  );
}
