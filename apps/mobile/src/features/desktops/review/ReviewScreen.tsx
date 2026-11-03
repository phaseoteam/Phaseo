import { LegendList } from "@legendapp/list/react-native";
import { ChevronDown, ChevronRight, FileDiff, MessageSquarePlus, RefreshCw, ShieldOff } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text as NativeText, View, type TextProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, EmptyState, ErrorState, Header, IconButton, Screen, Segmented, Sheet, SkeletonRows, Text, TextField, toast, useToneColor, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { setChatDraft } from "../chatDraft";
import type { DesktopClient } from "../client";
import { ConnectionNotice } from "../CodeThreadList";
import { clientFor } from "../connections";
import { useDesktopChat } from "../hooks";
import type { PhoneDiffFile, PhoneDiffScope } from "../protocol";
import { useDesktop } from "../store";
import { appendBlock, diffRows, diffSummary, fileCounts, fileStatusWord, pickedRows, rangeLabel, reviewComment, SCOPES, splitPath, type DiffRow } from "./diffLines";
import { useThreadDiff } from "./hooks";

/** The app's type has no monospace face; code reads in the platform's, as Markdown's code blocks do. */
const MONO = { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) };
/** Code text: React Native's own, since the app's Text sets its sans face by class, which wins over a style. */
function Code({ className, ...props }: TextProps & { className?: string }) {
  return <NativeText {...props} className={cn("text-[12px] text-muted-foreground", className)} style={MONO} />;
}

type Item =
  | { kind: "file"; key: string; file: PhoneDiffFile; open: boolean }
  | { kind: "row"; key: string; path: string; row: DiffRow }
  | { kind: "file-note"; key: string; path: string; text: string; loading?: boolean };
type Selection = { path: string; from: string; to: string };

/**
 * A thread's changes on its computer, read-only: uncommitted work, the branch since it left its base, or one turn. Files
 * list with their counts and open into numbered, tinted lines. A long press on a line starts a selection, a tap on
 * another extends it, and the comment written about it goes into the thread's message, never to the computer.
 */
export function ReviewScreen({ desktopId, chatId, scope: initialScope, messageId }: { desktopId: string; chatId: string; scope: PhoneDiffScope; messageId: string | null }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  if (desktop === undefined) return <Screen><Header back title="Review" /><SkeletonRows count={5} /></Screen>;
  if (!client) return <Screen><Header back title="Review" /><EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." /></Screen>;
  return <Review client={client} desktopId={desktopId} chatId={chatId} initialScope={initialScope} messageId={messageId} />;
}

function Review({ client, desktopId, chatId, initialScope, messageId }: { client: DesktopClient; desktopId: string; chatId: string; initialScope: PhoneDiffScope; messageId: string | null }) {
  const insets = useSafeAreaInsets();
  const { view } = useDesktopChat(client, chatId);
  const chat = view?.chat ?? null;
  const [scope, setScope] = useState(initialScope);
  // A turn picked from a changed-files row; choosing This turn again shows the latest.
  const [turn, setTurn] = useState(messageId);
  const { allowed, diff, error, loading, reload, loadFile, fileOf } = useThreadDiff(client, chat, scope, turn);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");

  const toggle = useCallback((file: PhoneDiffFile) => {
    haptic("selection");
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(file.path)) next.delete(file.path); else next.add(file.path);
      return next;
    });
  }, []);
  // An open file the diff had no room for is read on its own, once per version of the diff.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const file of diff?.files ?? []) {
      const key = `${diff?.hash}:${file.path}`;
      if (!open.has(file.path) || file.patch || file.binary || requested.current.has(key)) continue;
      requested.current.add(key);
      loadFile(file.path);
    }
  }, [diff, open, loadFile]);

  const rowsByPath = useMemo(() => {
    const rows = new Map<string, DiffRow[]>();
    for (const file of diff?.files ?? []) {
      const read = fileOf(file);
      if (typeof read !== "string" && read.patch && open.has(file.path)) rows.set(file.path, diffRows(read.patch));
    }
    return rows;
  }, [diff, fileOf, open]);

  const items = useMemo<Item[]>(() => (diff?.files ?? []).flatMap((file): Item[] => {
    const isOpen = open.has(file.path);
    const head: Item = { kind: "file", key: `file:${file.path}`, file, open: isOpen };
    if (!isOpen) return [head];
    if (file.binary) return [head, { kind: "file-note", key: `note:${file.path}`, path: file.path, text: "A binary file. Open it on the computer to see it." }];
    const read = fileOf(file);
    if (typeof read === "string") return [head, { kind: "file-note", key: `note:${file.path}`, path: file.path, text: read }];
    const rows = rowsByPath.get(file.path);
    if (!rows) return [head, { kind: "file-note", key: `note:${file.path}`, path: file.path, text: "Reading this file…", loading: true }];
    const tail: Item[] = read.truncated ? [{ kind: "file-note", key: `cut:${file.path}`, path: file.path, text: "This file's changes are too long for the phone. The rest is on the computer." }] : [];
    if (!rows.length) return [head, { kind: "file-note", key: `note:${file.path}`, path: file.path, text: fileStatusWord(file) === "Renamed" ? "Renamed, with no other changes." : "No line changes (a mode change)." }];
    return [head, ...rows.map((row): Item => ({ kind: "row", key: `row:${file.path}:${row.key}`, path: file.path, row })), ...tail];
  }), [diff, open, fileOf, rowsByPath]);

  const picked = useMemo(() => (selection ? pickedRows(rowsByPath.get(selection.path) ?? [], selection.from, selection.to) : []), [selection, rowsByPath]);
  const pickedKeys = useMemo(() => new Set(picked.map((row) => `${selection?.path}:${row.key}`)), [picked, selection]);

  const onLine = useCallback((path: string, row: DiffRow, long: boolean) => {
    if (long) { haptic("press"); setSelection({ path, from: row.key, to: row.key }); return; }
    setSelection((current) => (current?.path === path ? { ...current, to: row.key } : current));
  }, []);

  const addComment = () => {
    if (!selection || !comment.trim()) return;
    setChatDraft(desktopId, chatId, (draft) => appendBlock(draft, reviewComment(selection.path, picked, comment)));
    haptic("success");
    toast("It's in the thread's message, ready to edit and send.", { title: "Comment added" });
    setComment("");
    setCommenting(false);
    setSelection(null);
  };

  const renderItem = useCallback(({ item }: { item: Item }) => {
    if (item.kind === "file") return <FileRow file={item.file} open={item.open} onToggle={toggle} />;
    if (item.kind === "file-note") return <FileNote text={item.text} loading={item.loading} />;
    return <LineRow path={item.path} row={item.row} picked={pickedKeys.has(`${item.path}:${item.row.key}`)} onPress={onLine} />;
  }, [toggle, onLine, pickedKeys]);

  const subtitle = scope === "branch" && diff?.headRef ? (diff.baseRef ? `${diff.headRef} against ${diff.baseRef}` : `${diff.headRef}, no base branch found`) : chat?.title ?? null;
  const body = !allowed ? (
    <EmptyState className="flex-1" icon={ShieldOff} title="Reading code is off for this phone" body="Turn on Read code for this phone on the computer, in Settings → Phone." />
  ) : error ? (
    <ErrorState className="flex-1" error={new Error(error)} onRetry={reload} />
  ) : !diff ? <SkeletonRows count={6} /> : !diff.repository ? (
    <EmptyState className="flex-1" icon={FileDiff} title="Not a git checkout" body="This thread's folder isn't a git repository, so there are no changes to compare." />
  ) : !diff.files.length ? (
    <EmptyState className="flex-1" icon={FileDiff} title="No changes" body={scope === "uncommitted" ? "Everything here is committed." : scope === "branch" ? "This branch has nothing its base doesn't." : "This turn didn't change any files."} />
  ) : (
    <LegendList
      data={items}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.kind}
      renderItem={renderItem}
      extraData={pickedKeys}
      estimatedItemSize={22}
      ListHeaderComponent={(
        <View className="flex-row items-center gap-2 px-4 pb-1 pt-2">
          <Text variant="caption" className="flex-1 font-semibold">{diffSummary(diff.files)}</Text>
          {loading ? <ActivityIndicator size={12} /> : null}
        </View>
      )}
      ListFooterComponent={diff.truncated ? <Text variant="caption" className="px-4 py-3">Some files are left out: these changes are too large to read on the phone.</Text> : null}
      contentContainerStyle={{ paddingBottom: insets.bottom + (selection ? 88 : 24) }}
    />
  );

  return (
    <Screen>
      <Header back title="Review" subtitle={subtitle} right={allowed ? <IconButton icon={RefreshCw} label="Refresh" onPress={reload} /> : null} />
      <ConnectionNotice client={client} />
      {allowed ? (
        <View className="px-4 pb-2">
          <Segmented value={scope} options={SCOPES} onChange={(value) => { setSelection(null); if (value === "turn" && scope === "turn") setTurn(null); setScope(value); }} />
        </View>
      ) : null}
      {body}
      {selection && picked.length ? (
        <View className="absolute inset-x-0 bottom-0 flex-row items-center gap-2 border-t border-border bg-background px-4 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
          <Code numberOfLines={1} className="flex-1 text-foreground">{rangeLabel(selection.path, picked)}</Code>
          <Button label="Cancel" variant="ghost" size="sm" onPress={() => setSelection(null)} />
          <Button label="Comment" icon={MessageSquarePlus} size="sm" onPress={() => setCommenting(true)} />
        </View>
      ) : null}
      <Sheet open={commenting} onClose={() => setCommenting(false)}>
        <View className="gap-3 px-4 pt-4">
          <Text variant="heading">Comment</Text>
          <Code numberOfLines={2}>{selection ? rangeLabel(selection.path, picked) : ""}</Code>
          <TextField value={comment} onChangeText={setComment} placeholder="What should change here?" multiline autoFocus className="min-h-24" textAlignVertical="top" />
          <Text variant="caption">{"It goes into this thread's message with the lines it's about. Nothing is sent until you send it."}</Text>
          <Button label="Add to message" disabled={!comment.trim()} onPress={addComment} />
        </View>
      </Sheet>
    </Screen>
  );
}

const FileRow = memo(function FileRow({ file, open, onToggle }: { file: PhoneDiffFile; open: boolean; onToggle(file: PhoneDiffFile): void }) {
  const { name, folder } = splitPath(file.path);
  const counts = fileCounts(file);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${file.path}, ${fileStatusWord(file)}, ${counts.replace("−", "minus ")}`}
      onPress={() => onToggle(file)}
      className="mt-1 flex-row items-center gap-2 border-t border-border px-4 py-2.5 active:bg-accent"
    >
      <Icon icon={open ? ChevronDown : ChevronRight} tone="muted" size={14} />
      <View className="flex-1">
        <Text variant="small" numberOfLines={1} className="font-semibold">{name}</Text>
        <Text variant="caption" numberOfLines={1}>{[file.oldPath ? `from ${file.oldPath}` : folder || null, fileStatusWord(file)].filter(Boolean).join(" · ")}</Text>
      </View>
      {file.binary || file.additions < 0 ? <Text variant="caption">Binary</Text> : (
        <View className="flex-row gap-1.5">
          <Text variant="caption" className="font-semibold text-success">{`+${file.additions}`}</Text>
          <Text variant="caption" className="font-semibold text-destructive">{`−${file.deletions}`}</Text>
        </View>
      )}
    </Pressable>
  );
});

function FileNote({ text, loading }: { text: string; loading?: boolean }) {
  const color = useToneColor("muted");
  return (
    <View className="flex-row items-center gap-2 px-4 py-2">
      {loading ? <ActivityIndicator size={11} color={color} /> : null}
      <Text variant="caption" className="flex-1">{text}</Text>
    </View>
  );
}

const number = (value: number | null) => (value === null ? "" : String(value));

/** One numbered line: old and new numbers, then the text, tinted green when added and red when removed. */
const LineRow = memo(function LineRow({ path, row, picked, onPress }: { path: string; row: DiffRow; picked: boolean; onPress(path: string, row: DiffRow, long: boolean): void }) {
  if (row.kind === "hunk" || row.kind === "note") {
    return (
      <View className="bg-muted/60 px-4 py-1">
        <Code numberOfLines={1}>{row.text}</Code>
      </View>
    );
  }
  const sign = row.kind === "add" ? "+" : row.kind === "remove" ? "−" : " ";
  const tint = picked ? "bg-primary/20" : row.kind === "add" ? "bg-success/10" : row.kind === "remove" ? "bg-destructive/10" : "";
  return (
    <Pressable
      accessibilityLabel={`${row.kind === "add" ? "Added" : row.kind === "remove" ? "Removed" : "Line"} ${row.newLine ?? row.oldLine}: ${row.text}`}
      accessibilityHint="Long press to comment on this line, then tap another to include the lines between"
      accessibilityState={{ selected: picked }}
      onPress={() => onPress(path, row, false)}
      onLongPress={() => onPress(path, row, true)}
      delayLongPress={350}
      className={cn("flex-row", tint)}
    >
      <Code className="w-9 pr-1 text-right text-[11px] text-muted-foreground">{number(row.oldLine)}</Code>
      <Code className="w-9 pr-1 text-right text-[11px] text-muted-foreground">{number(row.newLine)}</Code>
      <Code className={cn("w-4 text-center text-[12px]", row.kind === "add" ? "text-success" : row.kind === "remove" ? "text-destructive" : "text-muted-foreground")}>{sign}</Code>
      <Code className="flex-1 pr-3 text-[12px] leading-[18px] text-foreground">{row.text || " "}</Code>
    </Pressable>
  );
});
