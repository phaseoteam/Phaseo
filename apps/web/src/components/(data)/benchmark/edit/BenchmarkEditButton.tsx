import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

interface BenchmarkEditButtonProps {
  benchmarkId: string;
}

export default async function BenchmarkEditButton({
  benchmarkId,
}: BenchmarkEditButtonProps) {
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
        href={`/internal/data/benchmarks/${benchmarkId}/edit`}
        aria-label="Edit benchmark"
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </Button>
  );
}
