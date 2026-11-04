import { usePathname } from "expo-router";
import { SquarePen } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { Header, IconButton, Screen, SearchField, SkeletonRows } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { CodeThreadList, DesktopPicker, PairPrompt } from "./CodeThreadList";
import { chooseDesktop, chosenDesktop, pickedDesktopStore } from "./picked";
import { CODE_HREF, desktopChatInPath, newDesktopChatHref } from "./routes";
import { useDesktops } from "./store";

/**
 * Code: a paired computer's threads, like the desktop app's own sidebar. The computer picker sits at the top (or
 * "Pair a computer"), New thread beside the title and on each project folder. A thread opens as its own screen over
 * this one on phones, and beside it on tablets.
 */
export function CodeScreen() {
  const { split } = useLayout();
  const pathname = usePathname();
  const desktops = useDesktops();
  const picked = pickedDesktopStore.use();
  const desktop = desktops ? chosenDesktop(desktops, picked) : null;
  const open = useOpenDetail(CODE_HREF);
  const [query, setQuery] = useState("");
  const selected = desktopChatInPath(pathname);
  return (
    <Screen>
      <Header
        sidebar
        back={!split}
        large={split}
        title="Code"
        right={desktop ? <IconButton icon={SquarePen} label={`New thread on ${desktop.desktopName}`} onPress={() => open(newDesktopChatHref(desktop.desktopId))} /> : null}
      />
      {desktops == null ? <SkeletonRows count={4} /> : !desktop ? <PairPrompt /> : (
        <>
          <DesktopPicker desktops={desktops} chosenId={desktop.desktopId} onPick={desktops.length > 1 ? chooseDesktop : undefined} />
          <View className="px-4 pb-2"><SearchField value={query} onChangeText={setQuery} placeholder="Search threads" /></View>
          <View className="flex-1">
            <CodeThreadList key={desktop.desktopId} desktop={desktop} query={query} selectedChatId={selected?.desktopId === desktop.desktopId ? selected.chatId : null} open={open} />
          </View>
        </>
      )}
    </Screen>
  );
}
