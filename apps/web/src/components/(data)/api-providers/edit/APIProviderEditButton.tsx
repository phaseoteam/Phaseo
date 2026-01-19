import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import APIProviderEditDialog from "./APIProviderEditDialog";

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

  return <APIProviderEditDialog apiProviderId={apiProviderId} />;
}
