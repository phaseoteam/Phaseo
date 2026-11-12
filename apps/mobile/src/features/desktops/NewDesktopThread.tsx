import { useRouter } from "expo-router";
import { ChevronDown, Folder, GitBranch } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Keyboard, Pressable } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { EmptyState, Header, Icon, OptionSheet, Screen, Text, toast } from "@/components/ui";
import { modelLabel } from "@/features/chat/modelSheetRows";
import { Composer, type ComposerModel } from "@/features/composer/Composer";
import { resolveSendPresentation } from "@/features/composer/sendPresentation";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { ConnectionNotice } from "./CodeThreadList";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useDesktopChats, useDesktopModels, useDesktopProjects } from "./hooks";
import { choiceLogo, DesktopModelSheet, ModeSheet, type ModeControl } from "./DesktopModelSheet";
import { choiceIn, choiceLabel, newThreadModel, type ModelChoice } from "./newThread";
import type { PhoneChatMode } from "./protocol";
import { desktopChatHref } from "./routes";
import { useDesktop } from "./store";
import { makesChanges, worktreeBases } from "./git/gitState";
import { useBranches } from "./git/hooks";
import { useThreadDraft } from "./threadDraft";

const MODES = ["chat", "code", "plan"] as const;
const PLACEHOLDERS: Record<PhoneChatMode, string> = { chat: "Ask anything", code: "Describe the change", plan: "What should it plan?" };
const NO_PROJECT = "none";
const LOCAL = "\u0000local";

/**
 * A new thread on a computer: an empty thread with the composer focused and a line asking what to build, whose
 * project name picks another. The model beside send (any agent on the computer, starting where the computer's window
 * would) opens the thread's settings: the model and its effort, the mode (Chat, Code, Plan) and the permissions it
 * runs with, which the phone shows but can't change. With Make changes on, a Code or Plan thread in a git project can
 * start in a new worktree from a base branch, picked under the project as the window's Local / New worktree choice
 * does. The draft is kept per computer and project.
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
  const { list: loaded, unavailable } = useDesktopModels(client, project, mode);
  // Another mode lists its models again; until it has, the project's last list stays, so switching the mode in the open
  // sheet doesn't close it. The pick is checked against the new list when it comes.
  const [kept, setKept] = useState<{ project: string | null; list: NonNullable<typeof loaded> } | null>(null);
  if (loaded && kept?.list !== loaded) setKept({ project, list: loaded });
  const list = loaded ?? (!unavailable && kept?.project === project ? kept.list : null);
  // A pick is the project's: another project starts on its own default again, as in the window. Another mode keeps it while it's offered.
  const [picked, setPicked] = useState<{ project: string | null; choice: ModelChoice } | null>(null);
  const choice = list ? choiceIn(list, picked?.project === project ? picked.choice : null) : null;
  const [starting, setStarting] = useState(false);
  const [sheet, setSheet] = useState<"model" | "mode" | "project" | "workspace" | null>(null);
  // A worktree base is the project's: another project starts Local again.
  const [worktree, setWorktree] = useState<{ project: string; base: string } | null>(null);
  const branches = useBranches(client, project);

  // The computer's projects when it lists them (pinned first, archived and worktrees left out), else those its threads name.
  const projects = useMemo(() => {
    if (listed) return listed.filter((entry) => !entry.archived && !entry.worktreeOf).map((entry) => ({ value: entry.id, label: entry.name }));
    const seen = new Map<string, string>();
    for (const chat of chats ?? []) if (chat.projectId && chat.project && !seen.has(chat.projectId)) seen.set(chat.projectId, chat.project);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [listed, chats]);
  const projectName = project ? projects.find((entry) => entry.value === project)?.label ?? "This project" : null;
  // Local / Worktree shows for a git project, in Code or Plan, while this phone may make changes.
  const offersWorktree = Boolean(project && mode !== "chat" && makesChanges(connection) && listed?.find((entry) => entry.id === project)?.repository);
  const base = offersWorktree && worktree?.project === project ? worktree.base : null;
  const modeControl: ModeControl = { value: mode, options: MODES, onChange: (value) => update({ mode: value }) };
  // Until the computer lists its models, or when it won't, the control still opens the mode.
  const model: ComposerModel = list && choice
    ? { label: choiceLabel(list, choice), logos: choiceLogo(list, choice), hint: "Choose the model, its effort and the mode", onPress: () => setSheet("model") }
    : { label: modelLabel(unavailable ? "The computer picks the model" : "Loading models…", null), hint: "Choose the mode", onPress: () => setSheet("mode") };

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
      const { chat } = await client.request("new_chat", { text: draft.text.trim(), mode, ...(project ? { projectId: project } : {}), ...newThreadModel(list, choice), ...(base ? { workspace: { kind: "worktree" as const, base } } : {}) });
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
          {offersWorktree ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={base ? `Where it runs, a new worktree from ${base}` : "Where it runs, Local"}
              accessibilityHint="Picks the project's own folder or a new worktree"
              onPress={() => { branches.load(); setSheet("workspace"); }}
              className="-ml-1.5 flex-row items-center gap-1.5 self-start rounded-md px-1.5 py-1 active:bg-accent"
            >
              <Icon icon={GitBranch} tone="muted" size={16} />
              <Text variant="body" className="text-muted-foreground">{base ? `Worktree from ${base}` : "Local"}</Text>
              <Icon icon={ChevronDown} tone="muted" size={16} />
            </Pressable>
          ) : null}
        </Pressable>
        <Composer
          text={draft.text}
          onChangeText={(text) => update({ text })}
          placeholder={PLACEHOLDERS[mode]}
          autoFocus
          onAttach={null}
          model={model}
          send={{ ...resolveSendPresentation({ editingQueuedMessage: false, running: false, canSteer: false, followUpBehavior: "steer", deliveryDeferred: false }), label: "Start thread" }}
          sendBlockedReason={starting ? "Starting the thread…" : null}
          onSend={() => void start()}
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
      <OptionSheet
        open={sheet === "workspace"}
        title="Where it runs"
        value={base ?? LOCAL}
        options={[{ value: LOCAL, label: "Local", description: "In the project's own folder" }, ...(branches.refs ? worktreeBases(branches.refs) : []).map((name) => ({ value: name, label: `New worktree from ${name}` }))]}
        onChange={(value) => setWorktree(value === LOCAL || !project ? null : { project, base: value })}
        onClose={() => setSheet(null)}
      />
      {list && choice ? <DesktopModelSheet list={list} choice={choice} mode={modeControl} permission={list.permissionMode ?? null} onChoose={(next) => setPicked({ project, choice: next })} open={sheet === "model"} onClose={() => setSheet(null)} /> : null}
      <ModeSheet mode={modeControl} open={sheet === "mode"} onClose={() => setSheet(null)} />
    </Screen>
  );
}
