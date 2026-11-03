import { useRouter } from "expo-router";
import { ChevronDown, Folder } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Chip, EmptyState, Header, HorizontalScroll, Icon, OptionSheet, Screen, Text, toast } from "@/components/ui";
import { Composer } from "@/features/composer/Composer";
import { resolveSendPresentation } from "@/features/composer/sendPresentation";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { ConnectionNotice } from "./CodeThreadList";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useDesktopChats, useDesktopModels, useDesktopProjects } from "./hooks";
import { DesktopModelSheet, ModelChip, PermissionChip } from "./DesktopModelSheet";
import { choiceIn, newThreadModel, type ModelChoice } from "./newThread";
import type { PhoneChatMode } from "./protocol";
import { desktopChatHref } from "./routes";
import { useDesktop } from "./store";
import { useThreadDraft } from "./threadDraft";

const MODES: { value: PhoneChatMode; label: string }[] = [
  { value: "chat", label: "Chat" },
  { value: "code", label: "Code" },
  { value: "plan", label: "Plan" },
];
const PLACEHOLDERS: Record<PhoneChatMode, string> = { chat: "Ask anything", code: "Describe the change", plan: "What should it plan?" };
const NO_PROJECT = "none";

/**
 * A new thread on a computer: an empty thread with the composer focused and a line asking what to build, whose
 * project name picks another. Under the composer, the mode (Chat, Code, Plan), the model (any agent on the computer,
 * starting where the computer's window would) and the permissions it runs with, which the phone shows but can't
 * change. The draft is kept per computer and project.
 */
export function NewDesktopThread({ desktopId, projectId }: { desktopId: string; projectId?: string | null }) {
  const router = useRouter();
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  const connection = useConnection(client);
  const listed = useDesktopProjects(client);
  const { chats } = useDesktopChats(client);
  const [project, setProject] = useState<string | null>(projectId ?? null);
  const { draft, update, clear } = useThreadDraft(desktopId, project);
  const mode = draft.mode ?? (project ? "code" : "chat");
  const { list, unavailable } = useDesktopModels(client, project, mode);
  // A pick is the project's: another project starts on its own default again, as in the window. Another mode keeps it while it's offered.
  const [picked, setPicked] = useState<{ project: string | null; choice: ModelChoice } | null>(null);
  const choice = list ? choiceIn(list, picked?.project === project ? picked.choice : null) : null;
  const [starting, setStarting] = useState(false);
  const [sheet, setSheet] = useState<"model" | "project" | null>(null);

  // The computer's projects when it lists them (pinned first, archived and worktrees left out), else those its threads name.
  const projects = useMemo(() => {
    if (listed) return listed.filter((entry) => !entry.archived && !entry.worktreeOf).map((entry) => ({ value: entry.id, label: entry.name }));
    const seen = new Map<string, string>();
    for (const chat of chats ?? []) if (chat.projectId && chat.project && !seen.has(chat.projectId)) seen.set(chat.projectId, chat.project);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [listed, chats]);
  const projectName = project ? projects.find((entry) => entry.value === project)?.label ?? "This project" : null;

  if (desktop === undefined) return <Screen><Header sidebar back title="New thread" /></Screen>;
  if (!client || !desktop) {
    return (
      <Screen>
        <Header sidebar back title="New thread" />
        <EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." />
      </Screen>
    );
  }

  const start = async () => {
    setStarting(true);
    haptic("press");
    try {
      const { chat } = await client.request("new_chat", { text: draft.text.trim(), mode, ...(project ? { projectId: project } : {}), ...newThreadModel(list, choice) });
      clear();
      // The new thread takes this screen's place.
      router.replace(desktopChatHref(desktopId, chat.id));
    } catch (problem) {
      haptic("error");
      toast(problem instanceof Error ? problem.message : "Couldn't start the thread.", { title: "Couldn't start the thread", tone: "error" });
      setStarting(false);
    }
  };

  return (
    <Screen>
      <Header sidebar back title="New thread" subtitle={`${desktop.desktopName} · ${connectionLabel(connection)}`} />
      <ConnectionNotice client={client} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable accessible={false} onPress={Keyboard.dismiss} className="flex-1 justify-end px-5 pb-5">
          <Text variant="title">{projectName ? "What should we build in" : "What should we build?"}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={projectName ? `Project, ${projectName}` : "No project"}
            accessibilityHint="Picks the project"
            onPress={() => setSheet("project")}
            className="-ml-1.5 mt-1 flex-row items-center gap-1.5 self-start rounded-md px-1.5 py-1 active:bg-accent"
          >
            <Icon icon={Folder} tone={projectName ? "foreground" : "muted"} size={18} />
            <Text variant="title" className={cn(!projectName && "text-muted-foreground")}>{projectName ? `${projectName}?` : "No project"}</Text>
            <Icon icon={ChevronDown} tone="muted" size={18} />
          </Pressable>
        </Pressable>
        <Composer
          text={draft.text}
          onChangeText={(text) => update({ text })}
          placeholder={PLACEHOLDERS[mode]}
          autoFocus
          onAttach={null}
          send={{ ...resolveSendPresentation({ editingQueuedMessage: false, running: false, canSteer: false, followUpBehavior: "steer", deliveryDeferred: false }), label: "Start thread" }}
          sendBlockedReason={starting ? "Starting the thread…" : null}
          onSend={() => void start()}
          below={(
            <HorizontalScroll keyboardShouldPersistTaps="handled" className="grow-0 pt-2" contentContainerClassName="gap-2">
              <View accessibilityRole="tablist" className="flex-row gap-1">
                {MODES.map((entry) => <Chip key={entry.value} label={entry.label} selected={mode === entry.value} onPress={() => update({ mode: entry.value })} />)}
              </View>
              <ModelChip list={list} choice={choice} unavailable={unavailable} onPress={() => setSheet("model")} />
              {list?.permissionMode ? <PermissionChip mode={list.permissionMode} /> : null}
            </HorizontalScroll>
          )}
        />
      </KeyboardAvoidingView>
      <OptionSheet
        open={sheet === "project"}
        title="Project"
        value={project ?? NO_PROJECT}
        options={[...projects, { value: NO_PROJECT, label: "No project" }]}
        onChange={(value) => setProject(value === NO_PROJECT ? null : value)}
        onClose={() => setSheet(null)}
      />
      {list && choice ? <DesktopModelSheet list={list} choice={choice} onChoose={(next) => setPicked({ project, choice: next })} open={sheet === "model"} onClose={() => setSheet(null)} /> : null}
    </Screen>
  );
}
