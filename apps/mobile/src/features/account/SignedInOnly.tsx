import { useRouter } from "expo-router";
import { LogIn } from "lucide-react-native";
import type { ReactNode } from "react";
import { EmptyState, Header, LoadingState, Screen } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";

/** Wraps account pages that need a session and a workspace; shows a sign-in prompt otherwise. */
export function SignedInOnly({ title, children }: { title: string; children: (workspaceId: string) => ReactNode }) {
  const router = useRouter();
  const { split } = useLayout();
  const { session } = useAuth();
  const { workspaceId, loading } = useWorkspace();
  if (!session) {
    return (
      <Screen>
        <Header back={!split} title={title} />
        <EmptyState className="flex-1" icon={LogIn} title="Sign in to see this" body="Your usage, keys and workspace live in your Phaseo account." action="Sign in" onAction={() => router.push("/sign-in")} />
      </Screen>
    );
  }
  if (!workspaceId) {
    return (
      <Screen>
        <Header back={!split} title={title} />
        {loading ? <LoadingState /> : <EmptyState className="flex-1" title="No workspace yet" body="Create a workspace on phaseo.app, then come back." />}
      </Screen>
    );
  }
  return <>{children(workspaceId)}</>;
}
