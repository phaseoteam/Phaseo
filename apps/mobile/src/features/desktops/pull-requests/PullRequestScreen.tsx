import { LegendList } from "@legendapp/list/react-native";
import { CircleCheck, CircleDot, CircleX, ExternalLink, GitMerge, GitPullRequest, GitPullRequestClosed, MessageSquare, RefreshCw, ShieldOff } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Markdown } from "@/components/Markdown";
import { Badge, Button, Callout, confirm, EmptyState, ErrorState, Header, IconButton, Row, Screen, Section, Segmented, Sheet, showActions, SkeletonRows, Text, TextField, toast, useToneColor } from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import type { DesktopClient } from "../client";
import { ConnectionNotice } from "../CodeThreadList";
import { clientFor, useConnection } from "../connections";
import { Progress } from "../git/GitScreen";
import { checkSummary, defaultMergeMethod, makesChanges, mergeBlocker, mergeWords, reviewWords } from "../git/gitState";
import { useGitRunner } from "../git/hooks";
import type { PhoneDiffFile, PhoneMergeMethod, PhonePullRequestAction, PhonePullRequestCheck, PhonePullRequestEvent, PhonePullRequestView } from "../protocol";
import { diffRows, type DiffRow } from "../review/diffLines";
import { FileNote, FileRow, LineRow } from "../review/ReviewScreen";
import { useDesktop } from "../store";
import { usePullRequest, usePullRequestFiles } from "./hooks";

type Segment = "overview" | "files" | "activity";
const SEGMENTS: { value: Segment; label: string }[] = [{ value: "overview", label: "Overview" }, { value: "files", label: "Files" }, { value: "activity", label: "Activity" }];
const STATE_WORDS = { open: "Open", closed: "Closed", merged: "Merged" } as const;
type ReviewEvent = Extract<PhonePullRequestAction, { type: "review" }>["event"];
const REVIEW_EVENTS: { value: ReviewEvent; label: string }[] = [{ value: "comment", label: "Comment" }, { value: "approve", label: "Approve" }, { value: "request-changes", label: "Request changes" }];

/**
 * One pull request, read through the computer's GitHub sign-in: Overview (checks, reviews, description), Files (the
 * Review screen's diff rows) and Activity. With Make changes, Review (Comment, Approve, Request changes), Merge with
 * the computer's method, Close and Reopen, each confirmed by GitHub's answer before the screen changes.
 */
export function PullRequestScreen({ desktopId, projectId, number }: { desktopId: string; projectId: string; number: number }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  if (desktop === undefined) return <Screen><Header back title={`#${number}`} /><SkeletonRows count={5} /></Screen>;
  if (!client) return <Screen><Header back title={`#${number}`} /><EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." /></Screen>;
  return <PullRequest client={client} projectId={projectId} number={number} />;
}

function PullRequest({ client, projectId, number }: { client: DesktopClient; projectId: string; number: number }) {
  const insets = useSafeAreaInsets();
  const writes = makesChanges(useConnection(client));
  const { allowed, view, error, loading, reload, replace } = usePullRequest(client, projectId, number);
  const [segment, setSegment] = useState<Segment>("overview");
  const { running, error: failed, run, clearError } = useGitRunner();
  const spinner = useToneColor("muted");
  const [reviewing, setReviewing] = useState(false);
  const [event, setEvent] = useState<ReviewEvent>("comment");
  const [words, setWords] = useState("");

  const act = async (label: string, action: PhonePullRequestAction, done: string) => {
    if (!view) return false;
    const after = await run(label, () => client.request("pr_action", { projectId, number, headOid: view.headOid, action }));
    if (!after) return false;
    replace(after); haptic("success"); toast(done);
    return true;
  };
  const merge = async (method: PhoneMergeMethod) => {
    if (!view || !await confirm({ title: `${mergeWords[method]}?`, body: `Merges #${view.number} into ${view.base} on GitHub, through the computer's sign-in.`, confirmLabel: "Merge" })) return;
    await act("Merging…", { type: "merge", method }, `Merged #${view.number}`);
  };
  const pickMethod = () => {
    if (!view) return;
    showActions({ title: "Merge", actions: view.mergeMethods.map((method) => ({ key: method, label: mergeWords[method], ...(method === view.mergeMethod ? { description: "The computer's setting" } : {}), onPress: () => void merge(method) })) });
  };
  const close = async () => {
    if (!view) return;
    const reopen = view.state === "closed";
    if (!reopen && !await confirm({ title: `Close #${view.number}?`, body: "It can be reopened later.", confirmLabel: "Close", destructive: true })) return;
    await act(reopen ? "Reopening…" : "Closing…", { type: reopen ? "reopen" : "close" }, reopen ? `Reopened #${view.number}` : `Closed #${view.number}`);
  };
  const submitReview = async () => {
    setReviewing(false);
    if (await act("Sending the review…", { type: "review", event, body: words.trim() }, event === "approve" ? "Approved" : event === "request-changes" ? "Changes requested" : "Review sent")) { setWords(""); setEvent("comment"); }
  };

  const title = view ? view.title : `#${number}`;
  const body = !allowed ? <EmptyState className="flex-1" icon={ShieldOff} title="Reading code is off for this phone" body="Turn on Read code for this phone on the computer, in Settings → Phone." />
    : error && !view ? <ErrorState className="flex-1" error={new Error(error.message)} onRetry={reload} />
    : !view ? <SkeletonRows count={6} />
    : segment === "files" ? <Files client={client} projectId={projectId} view={view} />
    : segment === "activity" ? <Activity events={view.events} truncated={view.eventsTruncated} />
    : (
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="gap-1 px-4 pt-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge label={view.draft && view.state === "open" ? "Draft" : STATE_WORDS[view.state]} tone={view.state === "merged" ? "primary" : view.state === "closed" || view.draft ? "neutral" : "success"} />
            <Text variant="caption">{`${view.head} into ${view.base} · ${view.author}`}</Text>
          </View>
          <Text variant="caption">{[`${view.changedFiles} ${view.changedFiles === 1 ? "file" : "files"}`, `+${view.additions} −${view.deletions}`, reviewWords[view.review]].filter(Boolean).join(" · ")}</Text>
        </View>
        <Progress running={running} error={failed} spinner={spinner} onDismiss={clearError} />
        {writes && view.state !== "merged" ? <Actions view={view} busy={Boolean(running)} onMerge={() => { const method = defaultMergeMethod(view); if (method) void merge(method); }} onPickMethod={pickMethod} onReview={() => setReviewing(true)} onClose={() => void close()} /> : null}
        {!writes ? <Callout className="mx-4 mt-3" title="Making changes is off for this phone">Turn on Make changes for this phone on the computer, in Settings → Phone, to review, merge or close from here.</Callout> : null}
        <Section title="Checks" description={checkSummary(view.checkRuns)}>
          {view.checkRuns.map((check, index) => <CheckRow key={`${check.name}:${index}`} check={check} last={index === view.checkRuns.length - 1} />)}
        </Section>
        {view.reviews.length || view.reviewers.length ? (
          <Section title="Reviews">
            {view.reviews.map((review, index) => <Row key={`${review.author}:${index}`} title={review.author ?? "Someone"} value={reviewStateWord(review.state)} />)}
            {view.reviewers.map((login) => <Row key={`waiting:${login}`} title={login} value="Asked to review" />)}
          </Section>
        ) : null}
        <Section title="Description">
          <View className="px-4">
            {view.body.trim() ? <Markdown text={view.body} /> : <Text variant="muted">No description.</Text>}
            {view.bodyTruncated ? <Text variant="caption" className="mt-2">The rest is on GitHub.</Text> : null}
          </View>
        </Section>
        <View className="px-4 pt-6"><Button label="Open on GitHub" icon={ExternalLink} variant="outline" onPress={() => void Linking.openURL(view.url)} /></View>
      </ScrollView>
    );

  return (
    <Screen>
      <Header back title={title} subtitle={view ? `#${view.number} · ${view.repository}` : null} right={allowed ? <IconButton icon={RefreshCw} label="Refresh" onPress={loading || running ? undefined : reload} /> : null} />
      <ConnectionNotice client={client} />
      {allowed && view ? <View className="px-4 pb-2"><Segmented<Segment> value={segment} options={SEGMENTS} onChange={setSegment} /></View> : null}
      {body}
      <Sheet open={reviewing} onClose={() => setReviewing(false)}>
        <View className="gap-3 px-4 pt-4">
          <Text variant="heading">Review</Text>
          <Segmented<ReviewEvent> value={event} options={REVIEW_EVENTS} onChange={setEvent} />
          <TextField value={words} onChangeText={setWords} placeholder={event === "approve" ? "Anything to add? (optional)" : "What should change, or what you think"} multiline autoFocus className="min-h-24" textAlignVertical="top" accessibilityLabel="Review" />
          <Text variant="caption">{"Posted on GitHub by the computer's GitHub sign-in."}</Text>
          <Button label={event === "approve" ? "Approve" : event === "request-changes" ? "Request changes" : "Comment"} disabled={event !== "approve" && !words.trim()} onPress={() => void submitReview()} />
        </View>
      </Sheet>
    </Screen>
  );
}

function Actions({ view, busy, onMerge, onPickMethod, onReview, onClose }: { view: PhonePullRequestView; busy: boolean; onMerge(): void; onPickMethod(): void; onReview(): void; onClose(): void }) {
  const blocker = mergeBlocker(view), method = defaultMergeMethod(view);
  return (
    <View className="gap-2 px-4 pt-3">
      {view.state === "open" ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" label={method ? mergeWords[method] : "Merge"} icon={GitMerge} disabled={busy || Boolean(blocker)} onPress={onMerge} />
          {view.mergeMethods.length > 1 ? <Button label="Method" variant="outline" disabled={busy || Boolean(blocker)} onPress={onPickMethod} /> : null}
        </View>
      ) : null}
      {blocker && view.state === "open" ? <Text variant="caption">{blocker}</Text> : null}
      <View className="flex-row gap-2">
        {view.state === "open" ? <Button className="flex-1" label="Review" icon={MessageSquare} variant="outline" disabled={busy} onPress={onReview} /> : null}
        <Button className="flex-1" label={view.state === "closed" ? "Reopen" : "Close"} icon={view.state === "closed" ? GitPullRequest : GitPullRequestClosed} variant={view.state === "closed" ? "outline" : "destructive"} disabled={busy} onPress={onClose} />
      </View>
    </View>
  );
}

const reviewStateWord = (state: string) => ({ APPROVED: "Approved", CHANGES_REQUESTED: "Changes requested", COMMENTED: "Commented", DISMISSED: "Dismissed" })[state] ?? state;
const CHECK_ICONS = { passing: CircleCheck, failed: CircleX, pending: CircleDot, skipped: CircleDot, neutral: CircleDot } as const;
const CHECK_WORDS = { passing: "Passing", failed: "Failing", pending: "Running", skipped: "Skipped", neutral: "Neutral" } as const;

function CheckRow({ check, last }: { check: PhonePullRequestCheck; last: boolean }) {
  return <Row icon={CHECK_ICONS[check.status]} title={check.name} value={CHECK_WORDS[check.status]} onPress={check.url ? () => void Linking.openURL(check.url!) : undefined} chevron={false} last={last} />;
}

const EVENT_WORDS: Record<PhonePullRequestEvent["kind"], string> = { comment: "commented", review: "reviewed", "review-comment": "commented on a line", commit: "committed" };

function Activity({ events, truncated }: { events: PhonePullRequestEvent[]; truncated: boolean }) {
  const insets = useSafeAreaInsets();
  const [now] = useState(Date.now);
  if (!events.length) return <EmptyState className="flex-1" icon={MessageSquare} title="No activity yet" />;
  return (
    <LegendList
      data={events}
      keyExtractor={(item) => item.id}
      estimatedItemSize={72}
      ListHeaderComponent={truncated ? <Text variant="caption" className="px-4 pb-2">The latest activity. The rest is on GitHub.</Text> : null}
      renderItem={({ item }) => (
        <View className="gap-1 border-b border-border px-4 py-3">
          <Text variant="caption">{[`${item.author ?? "Someone"} ${item.reviewState ? reviewStateWord(item.reviewState).toLowerCase() : EVENT_WORDS[item.kind]}`, item.path ?? null, formatRelativeTime(Math.min(Date.parse(item.createdAt), now), now)].filter(Boolean).join(" · ")}</Text>
          {item.kind === "commit" ? <Text variant="small" className="font-semibold">{item.body}</Text> : item.body.trim() ? <Markdown text={item.body} /> : null}
          {item.truncated ? <Text variant="caption">The rest is on GitHub.</Text> : null}
        </View>
      )}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    />
  );
}

type FileItem = { kind: "file"; key: string; file: PhoneDiffFile; open: boolean } | { kind: "row"; key: string; path: string; row: DiffRow } | { kind: "note"; key: string; text: string };

/** The pull request's files as GitHub sent them, with the Review screen's rows; a patch GitHub left out says so. */
function Files({ client, projectId, view }: { client: DesktopClient; projectId: string; view: PhonePullRequestView }) {
  const insets = useSafeAreaInsets();
  const { files, total, error, more } = usePullRequestFiles(client, projectId, view, true);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((file: PhoneDiffFile) => setOpen((current) => { const next = new Set(current); if (next.has(file.path)) next.delete(file.path); else next.add(file.path); return next; }), []);
  const items = useMemo<FileItem[]>(() => (files ?? []).flatMap((file): FileItem[] => {
    const head: FileItem = { kind: "file", key: `file:${file.path}`, file, open: open.has(file.path) };
    if (!open.has(file.path)) return [head];
    if (!file.patch) return [head, { kind: "note", key: `note:${file.path}`, text: file.truncated ? "Too large to show on the phone. Open it on GitHub." : "No line changes to show (a binary file, or a rename)." }];
    return [head, ...diffRows(file.patch).map((row): FileItem => ({ kind: "row", key: `row:${file.path}:${row.key}`, path: file.path, row }))];
  }), [files, open]);
  if (error && !files) return <ErrorState className="flex-1" error={new Error(error)} />;
  if (!files) return <SkeletonRows count={6} />;
  return (
    <LegendList
      data={items}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.kind}
      estimatedItemSize={22}
      renderItem={({ item }) => item.kind === "file" ? <FileRow file={item.file} open={item.open} onToggle={toggle} /> : item.kind === "note" ? <FileNote text={item.text} /> : <LineRow path={item.path} row={item.row} picked={false} />}
      ListHeaderComponent={<Text variant="caption" className="px-4 pb-1 font-semibold">{`${total} changed ${total === 1 ? "file" : "files"}`}</Text>}
      ListFooterComponent={more ? <View className="p-4"><Button label="Show more files" variant="outline" onPress={more} /></View> : null}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    />
  );
}
