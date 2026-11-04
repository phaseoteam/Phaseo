import { Redirect } from "expo-router";
import { launchHref } from "@/components/shell/navigation";
import { useAuth } from "@/providers/AuthProvider";

/** `/` (the app's start, and Home's old address): a new chat when signed in, Models when not. */
export default function Launch() {
  const { session } = useAuth();
  return <Redirect href={launchHref(Boolean(session))} />;
}
