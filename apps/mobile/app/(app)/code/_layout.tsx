import { SplitStack } from "@/components/shell/SplitStack";
import { CodeScreen } from "@/features/desktops/CodeScreen";

// A thread opened from a notification or link gets the Code list under it, so back returns there.
export const unstable_settings = { anchor: "index" };

export default function CodeLayout() {
  return <SplitStack list={<CodeScreen />} />;
}
