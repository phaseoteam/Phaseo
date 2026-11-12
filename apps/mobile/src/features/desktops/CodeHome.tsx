import { useRouter } from "expo-router";
import { Monitor } from "lucide-react-native";
import { useEffect } from "react";
import { EmptyState, Header, Screen, SkeletonRows } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { ConnectionNotice, PairPrompt } from "./CodeThreadList";
import { clientFor } from "./connections";
import { chooseDesktop, workspaceDesktop, workspaceStore } from "./picked";
import { newDesktopChatHref } from "./routes";
import { useDesktops } from "./store";

/**
 * `/code` with no thread open (after pairing, or an old link to the Code list): the computer the app works in, or
 * the first paired one, which it switches to so the sidebar lists its threads. Without a computer, how to pair one.
 */
export function CodeHome() {
  const router = useRouter();
  const { split } = useLayout();
  const desktops = useDesktops();
  const workspace = workspaceStore.use();
  const desktop = workspaceDesktop(desktops, workspace) ?? desktops?.[0] ?? null;
  const desktopId = desktop?.desktopId;
  useEffect(() => { if (desktopId) chooseDesktop(desktopId); }, [desktopId]);
  return (
    <Screen>
      <Header sidebar back title={desktop?.desktopName ?? "Your computers"} />
      {desktops == null ? <SkeletonRows count={4} /> : !desktop ? <PairPrompt /> : (
        <>
          <ConnectionNotice client={clientFor(desktop)} />
          <EmptyState
            className="flex-1"
            icon={Monitor}
            title="Pick a thread"
            body={split ? "Its projects and threads are in the sidebar." : "Its projects and threads are in the sidebar. Swipe right or use the sidebar button to open it."}
            action="New thread"
            onAction={() => router.replace(newDesktopChatHref(desktop.desktopId))}
          />
        </>
      )}
    </Screen>
  );
}
