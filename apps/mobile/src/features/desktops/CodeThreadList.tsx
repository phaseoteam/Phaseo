import { LegendList } from "@legendapp/list/react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter, type Href } from "expo-router";
import { Camera, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDotDashed, ClipboardPaste, Folder, GitBranch, Monitor, Plus, ShieldQuestion, SquareTerminal, type LucideIcon } from "lucide-react-native";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Button, Callout, CALLOUT_TONES, EmptyState, ErrorState, Icon, SkeletonRows, Text, useToneColor } from "@/components/ui";
import type { IconTone } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/format";
import type { DesktopClient } from "./client";
import { codeListItems, codeStatus, type CodeListItem, type CodeStatus } from "./codeList";
import { clientFor, connectionLabel, useConnection } from "./connections";
import { useDesktopChats } from "./hooks";
import { useNeedsYouCount } from "./needsYou";
import type { PhoneChat } from "./protocol";
import type { SavedDesktop } from "./reach";
import { desktopChatHref, newDesktopChatHref } from "./routes";

const PAIR_LINK = "phaseo://pair?p=";

/** Why the desktop can't be used right now, with a way to try again; nothing while it's connected or connecting. */
export function ConnectionNotice({ client }: { client: DesktopClient }) {
  const state = useConnection(client);
  if (state.status !== "offline" && state.status !== "refused") return null;
  const tone = state.status === "refused" ? "critical" : "warning";
  return (
    <Callout tone={tone} role="status" title={state.status === "refused" ? "Can't use this computer" : "Not connected"} className="mx-4 mb-2">
      <View className="gap-2">
        <Text variant="muted" className={CALLOUT_TONES[tone].description}>{state.message}</Text>
        <Button label="Try again" size="sm" variant="outline" className="self-start" onPress={() => client.retryNow()} />
      </View>
    </Callout>
  );
}

/** The paired computers, each with how it's reached and how many threads need you; `onPick` is left out with only one. */
export function DesktopPicker({ desktops, chosenId, onPick }: { desktops: SavedDesktop[]; chosenId: string; onPick?(desktopId: string): void }) {
  return (
    <View className="gap-0.5 pb-2">
      {desktops.map((desktop) => <DesktopOption key={desktop.desktopId} desktop={desktop} selected={Boolean(onPick) && desktop.desktopId === chosenId} onPick={onPick} />)}
    </View>
  );
}

function DesktopOption({ desktop, selected, onPick }: { desktop: SavedDesktop; selected: boolean; onPick?(desktopId: string): void }) {
  const state = useConnection(clientFor(desktop));
  const count = useNeedsYouCount(desktop.desktopId);
  const label = connectionLabel(state);
  const content = (
    <>
      <Icon icon={Monitor} tone="muted" size={18} />
      <View className="flex-1">
        <Text variant="body" numberOfLines={1} className={cn(selected && "font-semibold")}>{desktop.desktopName}</Text>
        <Text variant="caption" numberOfLines={1} className={cn(state.status === "refused" && "text-destructive")}>{label}</Text>
      </View>
      {count ? <Text variant="caption" className="font-semibold text-warning">{count}</Text> : null}
    </>
  );
  const className = cn("mx-2 flex-row items-center gap-3 rounded-md px-3 py-2", selected && "bg-accent");
  const accessibilityLabel = [desktop.desktopName, label, count ? `${count} need you` : null].filter(Boolean).join(", ");
  if (!onPick) return <View accessible accessibilityLabel={accessibilityLabel} className={className}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={accessibilityLabel} onPress={() => onPick(desktop.desktopId)} className={cn(className, "active:bg-accent")}>
      {content}
    </Pressable>
  );
}

/** With no computer paired: what pairing gives, and the two ways to do it. */
export function PairPrompt() {
  const router = useRouter();
  // A copied pairing link pairs at once; anything else opens the pairing screen to scan or paste there.
  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => "")).replace(/\s+/g, "");
    const p = text.startsWith(PAIR_LINK) ? text.slice(PAIR_LINK.length) : "";
    router.push(p ? { pathname: "/pair", params: { p } } : "/pair");
  };
  return (
    <View className="items-center gap-2 px-8 py-12">
      <View className="mb-1"><Icon icon={Monitor} tone="muted" size={28} /></View>
      <Text variant="heading" className="text-center">Pair a computer</Text>
      <Text variant="muted" className="text-center">Use your threads on Phaseo for desktop from this phone. On the computer, open Settings → Phone, turn on Allow phone access and choose Pair a phone.</Text>
      <View className="mt-3 flex-row flex-wrap justify-center gap-2">
        <Button label="Scan the code" icon={Camera} variant="outline" size="sm" onPress={() => router.push("/pair")} />
        <Button label="Paste the link" icon={ClipboardPaste} variant="outline" size="sm" onPress={() => void paste()} />
      </View>
    </View>
  );
}

/**
 * A paired computer's threads, laid out like the desktop's sidebar (see codeListItems): needs you first, project
 * folders each with a New thread action, settled threads folded at the foot. `open` shows a thread or a new one.
 */
export function CodeThreadList({ desktop, query, selectedChatId, open }: { desktop: SavedDesktop; query: string; selectedChatId: string | null; open(href: Href): void }) {
  const client = clientFor(desktop);
  const { desktopId } = desktop;
  const state = useConnection(client);
  const { chats, error, reload, loadMore, loadingMore } = useDesktopChats(client);
  const [settledOpen, setSettledOpen] = useState(false);
  // Only the loaded threads are searched: the computer has no search to ask.
  const search = useDeferredValue(query);
  const items = useMemo(() => (chats ? codeListItems(chats, { query: search, settledOpen }) : null), [chats, search, settledOpen]);
  const openChat = useCallback((chat: PhoneChat) => open(desktopChatHref(desktopId, chat.id)), [open, desktopId]);
  const newThread = useCallback((projectId: string | null) => open(newDesktopChatHref(desktopId, projectId)), [open, desktopId]);
  const toggleSettled = useCallback(() => setSettledOpen((current) => !current), []);
  const renderItem = useCallback(({ item }: { item: CodeListItem }) => {
    if (item.type === "thread") return <ThreadRow chat={item.chat} selected={item.chat.id === selectedChatId} onOpen={openChat} />;
    if (item.type === "folder") return <FolderRow title={item.title} projectId={item.projectId} onNew={newThread} />;
    return <HeadingRow title={item.title} count={item.count} open={item.open} onToggle={item.toggle ? toggleSettled : undefined} />;
  }, [openChat, newThread, toggleSettled, selectedChatId]);
  const extraData = useMemo(() => ({ selectedChatId }), [selectedChatId]);
  return (
    <>
      <ConnectionNotice client={client} />
      {items == null ? (error && state.status === "connected" ? <ErrorState error={new Error(error)} onRetry={reload} /> : <SkeletonRows count={6} />) : (
        <LegendList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          renderItem={renderItem}
          extraData={extraData}
          estimatedItemSize={60}
          recycleItems
          onEndReached={loadMore ?? undefined}
          ListFooterComponent={loadingMore ? <SkeletonRows count={2} /> : null}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={search.trim()
            ? <EmptyState title="No threads match" body="Search looks through the titles, projects and branches of the threads loaded so far." />
            : <EmptyState icon={SquareTerminal} title="No threads on this computer yet" action="New thread" onAction={() => newThread(null)} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </>
  );
}

/** "Needs you", and "Settled", which folds: a label and a rule, with the count while folded. */
function HeadingRow({ title, count, open, onToggle }: { title: string; count: number; open: boolean; onToggle?(): void }) {
  const label = <Text variant="caption" className={cn("font-semibold", onToggle ? "text-muted-foreground" : "text-warning")}>{open ? title : `${title} (${count})`}</Text>;
  if (!onToggle) return <View className="mx-2 flex-row items-center gap-2 px-3 pb-1 pt-3">{label}<View className="h-px flex-1 bg-border" /></View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}, ${count}`} onPress={onToggle} className="mx-2 mt-2 h-9 flex-row items-center gap-2 rounded-md px-3 active:bg-accent">
      {label}
      <View className="h-px flex-1 bg-border" />
      <Icon icon={open ? ChevronDown : ChevronRight} tone="muted" size={14} />
    </Pressable>
  );
}

/** A project folder's heading, with its New thread action. */
function FolderRow({ title, projectId, onNew }: { title: string; projectId: string | null; onNew(projectId: string | null): void }) {
  return (
    <View className="mx-2 mt-2 h-9 flex-row items-center gap-2 pl-3">
      <Icon icon={Folder} tone="muted" size={14} />
      <Text variant="caption" numberOfLines={1} className="flex-1 font-semibold text-muted-foreground">{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={projectId ? `New thread in ${title}` : "New thread without a project"} hitSlop={6} onPress={() => onNew(projectId)} className="h-9 w-9 items-center justify-center rounded-md active:bg-accent">
        <Icon icon={Plus} tone="muted" size={16} />
      </Pressable>
    </View>
  );
}

const STATUS_LOOK: Record<CodeStatus["kind"], { icon?: LucideIcon; tone: IconTone; text: string }> = {
  "needs-you": { icon: ShieldQuestion, tone: "warning", text: "text-warning" },
  working: { tone: "info", text: "text-info" },
  waiting: { icon: CircleDotDashed, tone: "muted", text: "text-muted-foreground" },
  failed: { icon: CircleAlert, tone: "destructive", text: "text-destructive" },
  stopped: { icon: CircleAlert, tone: "destructive", text: "text-destructive" },
  limited: { icon: CircleAlert, tone: "warning", text: "text-warning" },
  done: { icon: CircleCheck, tone: "success", text: "text-success" },
};

/** The desktop's status words and colours; work in progress spins. */
function StatusLabel({ status }: { status: CodeStatus }) {
  const look = STATUS_LOOK[status.kind];
  const info = useToneColor("info");
  return (
    <View className="flex-row items-center gap-1">
      {look.icon ? <Icon icon={look.icon} tone={look.tone} size={13} /> : <ActivityIndicator size={11} color={info} />}
      <Text variant="caption" className={cn("font-semibold", look.text)}>{status.label}</Text>
    </View>
  );
}

/** Two lines, as on the desktop: the title and its status, then the branch and when it last changed. */
const ThreadRow = memo(function ThreadRow({ chat, selected, onOpen }: { chat: PhoneChat; selected: boolean; onOpen(chat: PhoneChat): void }) {
  const status = codeStatus(chat);
  const when = formatRelativeDay(chat.updatedAt);
  const quiet = !status && !chat.unread;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[chat.title, status?.label, chat.attention, chat.branch ? `branch ${chat.branch}` : null, when].filter(Boolean).join(", ")}
      onPress={() => onOpen(chat)}
      className={cn("mx-2 rounded-md px-3 py-2.5 active:bg-accent", selected && "bg-accent")}
    >
      <View className="flex-row items-center gap-2">
        {chat.unread ? <View accessibilityLabel="Unread" className="h-2 w-2 rounded-[2px] bg-primary" /> : null}
        <Text variant="body" numberOfLines={1} className={cn("flex-1", quiet ? "text-muted-foreground" : "font-semibold")}>{chat.title}</Text>
        {status ? <StatusLabel status={status} /> : null}
      </View>
      <View className="mt-1 flex-row items-center gap-1.5">
        {chat.branch ? (
          <View className="shrink flex-row items-center gap-1">
            <Icon icon={GitBranch} tone="muted" size={12} />
            <Text variant="caption" numberOfLines={1} className="shrink">{chat.branch}</Text>
          </View>
        ) : null}
        <Text variant="caption" numberOfLines={1} className={cn("shrink", chat.branch && "ml-auto")}>{chat.needsYou && chat.attention ? `${chat.attention} · ${when}` : when}</Text>
      </View>
    </Pressable>
  );
});
