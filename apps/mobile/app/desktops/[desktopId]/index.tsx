import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { chooseDesktop } from "@/features/desktops/picked";
import { CODE_HREF } from "@/features/desktops/routes";

/** Older links to a computer's threads: Code, with that computer picked. */
export default function DesktopThreadsRedirect() {
  const router = useRouter();
  const { desktopId } = useLocalSearchParams<{ desktopId: string }>();
  useEffect(() => {
    chooseDesktop(desktopId);
    router.replace(CODE_HREF);
  }, [desktopId, router]);
  return null;
}
