import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button, EmptyState, Header, Screen, Section, Segmented, Select, Text, TextField, toast } from "@/components/ui";
import { ModelControl } from "@/features/chat/ModelSheet";
import { haptic } from "@/lib/haptics";
import { CodeModelSheet, codeModelLabel } from "./CodeModelSheet";
import { ConnectionNotice } from "./CodeThreadList";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useDesktopChats, useDesktopModels } from "./hooks";
import { initialChoice, newThreadModel, type ModelChoice } from "./newThread";
import type { PhoneChatMode } from "./protocol";
import { desktopChatHref } from "./routes";
import { useDesktop } from "./store";

const MODES: { value: PhoneChatMode; label: string }[] = [
  { value: "chat", label: "Chat" },
  { value: "code", label: "Code" },
  { value: "plan", label: "Plan" },
];
const NO_PROJECT = "none";

/**
 * Starts a thread on the computer, pushed over Code. The model and effort can be picked from the computer's own list;
 * left alone, and for permissions, the project's or the app's defaults on the computer apply.
 */
export function NewDesktopChatScreen({ desktopId, projectId }: { desktopId: string; projectId?: string | null }) {
  const router = useRouter();
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  const connection = useConnection(client);
  const { chats } = useDesktopChats(client);
  const [mode, setMode] = useState<PhoneChatMode>("code");
  const [project, setProject] = useState(projectId ?? NO_PROJECT);
  const [text, setText] = useState("");
  const [starting, setStarting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { list, unavailable } = useDesktopModels(client, project === NO_PROJECT ? null : project);
  // The pick belongs to the list it came from; a new project's list starts on that project's default again.
  const [picked, setPicked] = useState<{ list: typeof list; choice: ModelChoice } | null>(null);
  const choice = list ? (picked?.list === list ? picked.choice : initialChoice(list)) : null;
  // The protocol has no project list; the projects of the computer's threads are the ones a phone can name.
  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const chat of chats ?? []) if (chat.projectId && chat.project && !seen.has(chat.projectId)) seen.set(chat.projectId, chat.project);
    if (projectId && !seen.has(projectId)) seen.set(projectId, "This project");
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [chats, projectId]);

  if (desktop === undefined) return <Screen><Header back title="New thread" /></Screen>;
  if (!client || !desktop) {
    return (
      <Screen>
        <Header back title="New thread" />
        <EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." />
      </Screen>
    );
  }

  const start = async () => {
    setStarting(true);
    haptic("press");
    try {
      const { chat } = await client.request("new_chat", { text: text.trim(), mode, ...(project !== NO_PROJECT ? { projectId: project } : {}), ...newThreadModel(list, choice) });
      // The new thread takes this screen's place, so back returns to the Code list.
      router.replace(desktopChatHref(desktopId, chat.id));
    } catch (problem) {
      haptic("error");
      toast(problem instanceof Error ? problem.message : "Couldn't start the thread.", { title: "Couldn't start the thread", tone: "error" });
      setStarting(false);
    }
  };

  return (
    <Screen>
      <Header back title="New thread" subtitle={`${desktop.desktopName} · ${connectionLabel(connection)}`} />
      <ConnectionNotice client={client} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-16">
          <Section title="Mode">
            <View className="px-4"><Segmented<PhoneChatMode> value={mode} options={MODES} onChange={setMode} /></View>
          </Section>
          <Section title="Project" description="Without one, the thread uses the app's defaults on the computer.">
            <View className="px-4">
              <Select title="Project" value={project} onChange={setProject} options={[{ value: NO_PROJECT, label: "No project" }, ...projects]} />
            </View>
          </Section>
          <Section title="Message">
            <View className="gap-3 px-4">
              <TextField value={text} onChangeText={setText} placeholder="What should it do?" multiline className="min-h-28" textAlignVertical="top" accessibilityLabel="Message" autoFocus />
              <View className="flex-row items-center gap-2">
                {list && choice ? <ModelControl label={codeModelLabel(list, choice)} onPress={() => setSheetOpen(true)} /> : <Text variant="caption" className="flex-1">{unavailable ? "The computer picks the model." : "Loading the computer's models…"}</Text>}
                <View className="flex-1" />
                <Button label="Start" loading={starting} disabled={!text.trim()} onPress={() => void start()} />
              </View>
              <Text variant="caption">{"Permissions and other settings are the computer's. Change them there."}</Text>
            </View>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
      {list && choice ? <CodeModelSheet desktopId={desktopId} list={list} choice={choice} onChoose={(next) => setPicked({ list, choice: next })} open={sheetOpen} onClose={() => setSheetOpen(false)} /> : null}
    </Screen>
  );
}
