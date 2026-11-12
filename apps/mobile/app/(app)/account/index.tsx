import { Redirect } from "expo-router";
import { AccountMenu } from "@/features/account/AccountMenu";
import { useLayout } from "@/hooks/useLayout";
import { useAuth } from "@/providers/AuthProvider";

export default function AccountIndex() {
  const { split } = useLayout();
  const { session } = useAuth();
  // On tablets the menu is already in the list pane, so open the first page beside it.
  if (split) return <Redirect href={session ? "/account/usage" : "/account/appearance"} />;
  return <AccountMenu />;
}
