import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";

interface APIProviderEditButtonProps {
  apiProviderId: string;
}

export default async function APIProviderEditButton({
  apiProviderId,
}: APIProviderEditButtonProps) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;

  if (!authUser) {
    return null;
  }

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("user_id", authUser.id)
    .single();

  if (userData?.role !== "admin") {
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
