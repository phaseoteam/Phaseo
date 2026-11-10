import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { LogIn } from "lucide-react-native";
import type { ReactNode } from "react";
import { EmptyState, Header, LoadingState, Screen } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { WEB_ORIGIN } from "@/lib/config";
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
        <Header sidebar back={!split} title={title} />
        <EmptyState className="flex-1" icon={LogIn} title="Sign in to see this" body="Your usage, keys and workspace live in your Phaseo account." action="Sign in" onAction={() => router.push("/sign-in")} />
      </Screen>
    );
  }
  if (!workspaceId) {
    return (
      <Screen>
        <Header sidebar back={!split} title={title} />
        {loading ? <LoadingState /> : (
          // New accounts get their workspace when they first sign in on phaseo.app.
          <EmptyState className="flex-1" title="Finish setting up" body="Sign in once on phaseo.app to create your workspace, then come back." action="Open phaseo.app" onAction={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/sign-in`)} />
        )}
      </Screen>
    );
  }
  return <>{children(workspaceId)}</>;
}
