import { LegendList } from "@legendapp/list/react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { AtSign, ChevronDown, ChevronRight, File, FileQuestion, FileText, Folder, FolderOpen, RefreshCw, ShieldOff } from "lucide-react-native";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Markdown } from "@/components/Markdown";
import { Button, EmptyState, ErrorState, Header, Icon, IconButton, Screen, SearchField, Segmented, SkeletonRows, Text, toast, useToneColor } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { setChatDraft } from "../chatDraft";
import type { DesktopClient } from "../client";
import { Code } from "../Code";
import { ConnectionNotice } from "../CodeThreadList";
import { clientFor } from "../connections";
import type { PhoneFileEntry } from "../protocol";
import { desktopFilesHref } from "../routes";
import { useDesktop } from "../store";
import { fileLines, fileMention, isMarkdown, sizeLabel, splitFilePath, treeRows, withMention, type TreeRow } from "./fileTree";
import { useFilePreview, useFileSearch, useFileTree, type FilesTarget } from "./hooks";

/**
 * A thread's or a project's files on its computer, read-only: the tree with search, and a file's preview. From a
 * thread, a file or folder can be added to its message as `@path`; nothing is sent until the person sends it.
 */
export function FilesScreen({ desktopId, target, where, path }: { desktopId: string; target: FilesTarget; where: string | null; path: string | null }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  const title = path ? splitFilePath(path).name : "Files";
  if (desktop === undefined) return <Screen><Header back title={title} /><SkeletonRows count={5} /></Screen>;
  if (!client) return <Screen><Header back title={title} /><EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." /></Screen>;
  return path ? <FileView client={client} desktopId={desktopId} target={target} path={path} /> : <Tree client={client} desktopId={desktopId} target={target} where={where} />;
}

/** Adds a path to the thread's message, from a thread's Files only. */
function useAddToMessage(desktopId: string, target: FilesTarget) {
  const chatId = "chatId" in target ? target.chatId : null;
  return useMemo(() => (chatId ? (path: string, directory = false) => {
    setChatDraft(desktopId, chatId, (draft) => withMention(draft, fileMention(path, directory)));
    haptic("success");
    toast(`${fileMention(path, directory)} is in the thread's message, ready to send.`, { title: "Added to message" });
  } : null), [desktopId, chatId]);
}

function OffNotice() {
  return <EmptyState className="flex-1" icon={ShieldOff} title="Reading code is off for this phone" body="Turn on Read code for this phone on the computer, in Settings → Phone." />;
}

function Tree({ client, desktopId, target, where }: { client: DesktopClient; desktopId: string; target: FilesTarget; where: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { allowed, folders, open, toggle, reveal, reload } = useFileTree(client, target);
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query);
  const found = useFileSearch(client, target, search);
  const addToMessage = useAddToMessage(desktopId, target);
  const rows = useMemo(() => treeRows(folders, open), [folders, open]);
  const searching = Boolean(search.trim());

  const openFile = useCallback((entry: PhoneFileEntry) => router.push(desktopFilesHref(desktopId, target, where, entry.path)), [router, desktopId, target, where]);
  const onEntry = useCallback((entry: PhoneFileEntry) => {
    if (entry.directory) { haptic("selection"); toggle(entry.path); } else openFile(entry);
  }, [toggle, openFile]);
  const onLong = useMemo(() => (addToMessage ? (entry: PhoneFileEntry) => addToMessage(entry.path, entry.directory) : undefined), [addToMessage]);
  const renderRow = useCallback(({ item }: { item: TreeRow }) => (item.kind === "note"
    ? <NoteRow depth={item.depth} text={item.text} loading={item.loading} />
    : <EntryRow entry={item.entry} depth={item.depth} open={item.open} onPress={onEntry} onLongPress={onLong} />), [onEntry, onLong]);
  const renderFound = useCallback(({ item }: { item: PhoneFileEntry }) => <EntryRow entry={item} depth={0} open={false} showFolder onPress={item.directory ? (entry) => { setQuery(""); reveal(entry.path); } : openFile} onLongPress={onLong} />, [openFile, onLong, reveal]);

  const body = !allowed ? <OffNotice /> : searching ? (
    found.error ? <ErrorState className="flex-1" error={new Error(found.error.message)} />
      : !found.result ? <SkeletonRows count={6} />
        : (
          <LegendList
            data={found.result.entries}
            keyExtractor={(item) => item.path}
            renderItem={renderFound}
            estimatedItemSize={52}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState title="No files match" body="Search looks through file and folder names the computer's git doesn't ignore." />}
            ListFooterComponent={found.result.truncated ? <Text variant="caption" className="px-4 py-3">More match. Type more of the name to narrow it down.</Text> : null}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          />
        )
  ) : (
    <LegendList
      data={rows}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.kind}
      renderItem={renderRow}
      estimatedItemSize={40}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={addToMessage ? <Text variant="caption" className="px-4 py-3">{"Long press a file or folder to add it to the thread's message."}</Text> : null}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    />
  );

  return (
    <Screen>
      <Header back title="Files" subtitle={where} right={allowed ? <IconButton icon={RefreshCw} label="Refresh" onPress={reload} /> : null} />
      <ConnectionNotice client={client} />
      {allowed ? <View className="px-4 pb-2"><SearchField value={query} onChangeText={setQuery} placeholder="Search files" /></View> : null}
      {body}
    </Screen>
  );
}

const iconOf = (entry: PhoneFileEntry, open: boolean) => (entry.directory ? (open ? FolderOpen : Folder) : isMarkdown(entry.path) ? FileText : File);

/** A file or folder: indented by depth, a chevron on a folder; in search, the folder it's in under its name. */
const EntryRow = memo(function EntryRow({ entry, depth, open, showFolder, onPress, onLongPress }: { entry: PhoneFileEntry; depth: number; open: boolean; showFolder?: boolean; onPress(entry: PhoneFileEntry): void; onLongPress?: (entry: PhoneFileEntry) => void }) {
  const folder = showFolder ? splitFilePath(entry.path).folder : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.directory ? "Folder" : "File"} ${entry.path}`}
      accessibilityState={entry.directory ? { expanded: open } : undefined}
      accessibilityHint={onLongPress ? "Long press to add it to the thread's message" : undefined}
      onPress={() => onPress(entry)}
      onLongPress={onLongPress ? () => { haptic("press"); onLongPress(entry); } : undefined}
      delayLongPress={350}
      className="min-h-10 flex-row items-center gap-2 py-2 pr-4 active:bg-accent"
      style={{ paddingLeft: 16 + depth * 16 }}
    >
      <View className="w-3.5 items-center">{entry.directory ? <Icon icon={open ? ChevronDown : ChevronRight} tone="muted" size={14} /> : null}</View>
      <Icon icon={iconOf(entry, open)} tone="muted" size={16} />
      <View className="flex-1">
        <Text variant="small" numberOfLines={1}>{entry.name}</Text>
        {folder ? <Text variant="caption" numberOfLines={1}>{folder}</Text> : null}
      </View>
    </Pressable>
  );
});

function NoteRow({ depth, text, loading }: { depth: number; text: string; loading?: boolean }) {
  const color = useToneColor("muted");
  return (
    <View className="flex-row items-center gap-2 py-2 pr-4" style={{ paddingLeft: 16 + depth * 16 + 22 }}>
      {loading ? <ActivityIndicator size={11} color={color} /> : null}
      <Text variant="caption" className="flex-1">{text}</Text>
    </View>
  );
}

function FileView({ client, desktopId, target, path }: { client: DesktopClient; desktopId: string; target: FilesTarget; path: string }) {
  const insets = useSafeAreaInsets();
  const { name, folder } = splitFilePath(path);
  const { allowed, file, error, loading, reload } = useFilePreview(client, target, path);
  const addToMessage = useAddToMessage(desktopId, target);
  const markdown = isMarkdown(path);
  const [view, setView] = useState<"preview" | "source">("preview");
  const footer = addToMessage && allowed ? 72 : 0;

  const body = !allowed ? <OffNotice /> : error?.code === "not_found" ? (
    <EmptyState className="flex-1" icon={FileQuestion} title="Not found" body={error.message} />
  ) : error ? <ErrorState className="flex-1" error={new Error(error.message)} onRetry={reload} /> : !file ? <SkeletonRows count={8} /> : file.kind === "too-large" ? (
    <EmptyState className="flex-1" icon={FileQuestion} title="Too large to preview" body={`This file is ${sizeLabel(file.size)}. Open it on the computer to see it.`} />
  ) : file.kind === "unsupported" ? (
    <EmptyState className="flex-1" icon={FileQuestion} title="No preview for this file" body={`The phone can show text and images. This file is ${sizeLabel(file.size)}; open it on the computer to see it.`} />
  ) : file.kind === "image" ? (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + footer + 16 }}>
      <Image source={{ uri: file.dataUrl }} style={{ width: "100%", aspectRatio: 1 }} contentFit="contain" accessibilityLabel={name} />
      <Text variant="caption" className="pt-2 text-center">{sizeLabel(file.size)}</Text>
    </ScrollView>
  ) : markdown && view === "preview" ? (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + footer + 16 }}>
      <Markdown text={file.text} />
      {file.truncated ? <CutNote /> : null}
    </ScrollView>
  ) : <SourceLines text={file.text} truncated={file.truncated} bottom={insets.bottom + footer + 16} />;

  return (
    <Screen>
      <Header back title={name} subtitle={folder || null} right={allowed ? <View className="flex-row items-center">{loading ? <ActivityIndicator size={12} /> : null}<IconButton icon={RefreshCw} label="Refresh" onPress={reload} /></View> : null} />
      <ConnectionNotice client={client} />
      {allowed && markdown && file?.kind === "text" ? (
        <View className="px-4 pb-2">
          <Segmented value={view} options={VIEWS} onChange={(value) => setView(value === "source" ? "source" : "preview")} />
        </View>
      ) : null}
      {body}
      {addToMessage && allowed ? (
        <View className="absolute inset-x-0 bottom-0 flex-row items-center gap-2 border-t border-border bg-background px-4 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
          <Code numberOfLines={1} className="flex-1 text-foreground">{fileMention(path)}</Code>
          <Button label="Add to message" icon={AtSign} size="sm" onPress={() => addToMessage(path)} />
        </View>
      ) : null}
    </Screen>
  );
}

const VIEWS: { value: "preview" | "source"; label: string }[] = [{ value: "preview", label: "Preview" }, { value: "source", label: "Source" }];

function CutNote() {
  return <Text variant="caption" className="px-4 py-3">The rest of this file is too long for the phone. Open it on the computer to see all of it.</Text>;
}

type Line = { key: string; number: number; text: string };

/** Numbered lines in the monospace face, each wrapping at the phone's width under its own number. */
function SourceLines({ text, truncated, bottom }: { text: string; truncated: boolean; bottom: number }) {
  const lines = useMemo<Line[]>(() => fileLines(text).map((line, index) => ({ key: String(index), number: index + 1, text: line })), [text]);
  // Numbers line up whatever the file's length.
  const width = 12 + String(lines.length).length * 8;
  const renderLine = useCallback(({ item }: { item: Line }) => (
    <View className="flex-row">
      <Code className="pr-2 text-right text-[11px] leading-[18px]" style={{ width }}>{String(item.number)}</Code>
      <Code className="flex-1 pr-3 text-[12px] leading-[18px] text-foreground" selectable>{item.text || " "}</Code>
    </View>
  ), [width]);
  return (
    <LegendList
      data={lines}
      keyExtractor={(item) => item.key}
      renderItem={renderLine}
      estimatedItemSize={18}
      ListFooterComponent={truncated ? <CutNote /> : null}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: bottom }}
    />
  );
}
