import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import OrganisationEditDialog from "./OrganisationEditDialog";

interface OrganisationEditButtonProps {
  organisationId: string;
}

export default async function OrganisationEditButton({
  organisationId,
}: OrganisationEditButtonProps) {
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

  return <OrganisationEditDialog organisationId={organisationId} />;
}
