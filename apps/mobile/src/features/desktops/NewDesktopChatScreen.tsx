import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button, EmptyState, Header, Screen, Section, Segmented, Select, Text, TextField, toast } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useSidebarButton } from "@/features/chat/ChatDrawer";
import { ConnectionNotice } from "./DesktopChatList";
import { useDesktopChats } from "./hooks";
import type { PhoneChatMode } from "./protocol";
import { desktopChatHref } from "./routes";
import { useDesktop } from "./store";

const MODES: { value: PhoneChatMode; label: string }[] = [
  { value: "chat", label: "Chat" },
  { value: "code", label: "Code" },
  { value: "plan", label: "Plan" },
];
const NO_PROJECT = "none";

/** Starts a chat on the computer with the project's or the app's defaults; models and permissions stay on the computer. */
export function NewDesktopChatScreen({ desktopId }: { desktopId: string }) {
  const router = useRouter();
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  const connection = useConnection(client);
  const sidebarButton = useSidebarButton();
  const { chats } = useDesktopChats(client);
  const [mode, setMode] = useState<PhoneChatMode>("code");
  const [project, setProject] = useState(NO_PROJECT);
  const [text, setText] = useState("");
  const [starting, setStarting] = useState(false);
  // The protocol has no project list; the projects of the computer's chats are the ones a phone can name.
  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const chat of chats ?? []) if (chat.projectId && chat.project && !seen.has(chat.projectId)) seen.set(chat.projectId, chat.project);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [chats]);

  if (desktop === undefined) return <Screen><Header leading={sidebarButton} title="New chat" /></Screen>;
  if (!client || !desktop) {
    return (
      <Screen>
        <Header leading={sidebarButton} title="New chat" />
        <EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." />
      </Screen>
    );
  }

  const start = async () => {
    setStarting(true);
    haptic("press");
    try {
      const { chat } = await client.request("new_chat", { text: text.trim(), mode, ...(project !== NO_PROJECT ? { projectId: project } : {}) });
      router.replace(desktopChatHref(desktopId, chat.id));
    } catch (problem) {
      haptic("error");
      toast(problem instanceof Error ? problem.message : "Couldn't start the chat.", { title: "Couldn't start the chat", tone: "error" });
      setStarting(false);
    }
  };

  return (
    <Screen>
      <Header leading={sidebarButton} title="New chat" subtitle={`${desktop.desktopName} · ${connectionLabel(connection)}`} />
      <ConnectionNotice client={client} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-16">
          <Section title="Mode">
            <View className="px-4"><Segmented<PhoneChatMode> value={mode} options={MODES} onChange={setMode} /></View>
          </Section>
          <Section title="Project" description="Without one, the chat uses the app's defaults on the computer.">
            <View className="px-4">
              <Select title="Project" value={project} onChange={setProject} options={[{ value: NO_PROJECT, label: "No project" }, ...projects]} />
            </View>
          </Section>
          <Section title="Message">
            <View className="gap-3 px-4">
              <TextField value={text} onChangeText={setText} placeholder="What should it do?" multiline className="min-h-28" textAlignVertical="top" accessibilityLabel="Message" autoFocus />
              <Button label="Start the chat" loading={starting} disabled={!text.trim()} onPress={() => void start()} />
              <Text variant="caption">{"The computer's own model, permissions and settings apply. Change them on the computer."}</Text>
            </View>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
