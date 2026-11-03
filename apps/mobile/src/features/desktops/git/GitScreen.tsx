import { useRouter } from "expo-router";
import { ArrowDownToLine, ArrowUpFromLine, GitBranch, GitBranchPlus, GitPullRequest, GitPullRequestCreate, List, RefreshCw, ShieldOff, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Callout, EmptyState, ErrorState, Header, IconButton, Row, Screen, Section, Sheet, SkeletonRows, Text, TextField, toast, useToneColor } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import type { DesktopClient } from "../client";
import { ConnectionNotice } from "../CodeThreadList";
import { clientFor, useConnection } from "../connections";
import { desktopPullRequestHref, desktopPullRequestsHref } from "../routes";
import type { PhoneRequest } from "../protocol";
import { useDesktop } from "../store";
import { canPull, canPush, changedLabel, gitProgress, makesChanges, switchableBranches, upstreamLabel } from "./gitState";
import { useBranches, useGitRunner, useGitStatus, type GitError } from "./hooks";

const STATE_WORDS = { open: "Open", closed: "Closed", merged: "Merged" } as const;

/**
 * A project's Git on its computer, as the window's Git menu has it: the branch and how far it is from its upstream,
 * then Commit (with "Write message"), Push, Pull, Switch and Create branch, and the branch's pull request. Each runs the
 * window's own command on the computer; a progress row shows while it runs and git's own words when it fails. Without
 * Make changes for this phone, only the reading rows show.
 */
export function GitScreen({ desktopId, projectId, chatId, where }: { desktopId: string; projectId: string; chatId: string | null; where: string | null }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  if (desktop === undefined) return <Screen><Header back title="Git" /><SkeletonRows count={5} /></Screen>;
  if (!client) return <Screen><Header back title="Git" /><EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." /></Screen>;
  return <Git client={client} desktopId={desktopId} projectId={projectId} chatId={chatId} where={where} />;
}

function Git({ client, desktopId, projectId, chatId, where }: { client: DesktopClient; desktopId: string; projectId: string; chatId: string | null; where: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const connection = useConnection(client);
  const writes = makesChanges(connection);
  const { allowed, status, error, loading, reload, replace } = useGitStatus(client, projectId);
  const { running, error: failed, run, clearError } = useGitRunner();
  const branches = useBranches(client, projectId);
  const [message, setMessage] = useState("");
  const [branchSheet, setBranchSheet] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const spinner = useToneColor("muted");

  const act = async (label: keyof typeof gitProgress, request: Omit<Extract<PhoneRequest, { type: "git_action" }>, "id" | "type" | "projectId">, done: string) => {
    const after = await run(gitProgress[label], () => client.request("git_action", { projectId, ...request }));
    if (!after) return false;
    replace(after);
    haptic("success");
    toast(done);
    return true;
  };
  const commit = async (push: boolean) => {
    if (await act(push ? "commit-push" : "commit", { action: "commit", message: message.trim(), all: true, ...(push ? { push: true } : {}) }, push ? "Committed and pushed" : "Committed")) setMessage("");
  };
  const writeMessage = async () => {
    const written = await run(gitProgress.message, () => client.request("commit_message", { projectId }));
    if (written) setMessage(written.message);
  };
  const createPullRequest = async () => {
    const created = await run(gitProgress["pull-request"], () => client.request("create_pull_request", { projectId, ...(chatId ? { chatId } : {}) }));
    if (!created) return;
    haptic("success");
    toast(created.status === "created" ? `Pull request #${created.number} created${chatId ? " and linked to this thread" : ""}.` : `This branch already had #${created.number}${chatId ? ", now linked to this thread" : ""}.`);
    reload();
    router.push(desktopPullRequestHref(desktopId, projectId, created.number));
  };
  const openBranches = () => { branches.load(); setNewBranch(""); setBranchSheet(true); };
  const switchTo = async (name: string) => { setBranchSheet(false); await act("switch-branch", { action: "switch-branch", name }, `On ${name}`); };
  const create = async () => { const name = newBranch.trim(); setBranchSheet(false); await act("create-branch", { action: "create-branch", name }, `Created ${name}`); };

  const title = "Git";
  const subtitle = where ?? status?.branch ?? null;
  if (!allowed || error?.code === "forbidden") {
    return <Screen><Header back title={title} subtitle={subtitle} /><ConnectionNotice client={client} /><EmptyState className="flex-1" icon={ShieldOff} title="Reading code is off for this phone" body="Turn on Read code for this phone on the computer, in Settings → Phone." /></Screen>;
  }
  const body = error && !status ? <ErrorState className="flex-1" error={new Error(error.message)} onRetry={reload} />
    : !status ? <SkeletonRows count={5} />
    : !status.repository ? <EmptyState className="flex-1" icon={GitBranch} title="Not a git checkout" body="This project's folder isn't a git repository." />
    : (
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Row icon={GitBranch} title={status.branch || "Not on a branch"} subtitle={upstreamLabel(status)} value={changedLabel(status.files.length)} onPress={writes ? openBranches : undefined} />
        <Progress running={running} error={failed} spinner={spinner} onDismiss={clearError} />
        {!writes ? (
          <Callout className="mx-4 mt-4" title="Making changes is off for this phone">Turn on Make changes for this phone on the computer, in Settings → Phone, to commit, push and work on pull requests from here.</Callout>
        ) : (
          <>
            <Section title="Commit" description={status.files.length ? "Commits what's staged on the computer, or every change when nothing is." : "Nothing to commit."}>
              <View className="gap-2 px-4 pt-1">
                <TextField value={message} onChangeText={setMessage} placeholder="Commit message" multiline className="min-h-20" textAlignVertical="top" editable={!running} accessibilityLabel="Commit message" />
                <Button className="self-start" label="Write message" icon={Sparkles} variant="outline" size="sm" disabled={Boolean(running) || !status.files.length} onPress={() => void writeMessage()} />
                <View className="flex-row gap-2">
                  <Button className="flex-1" label="Commit" variant="secondary" disabled={Boolean(running) || !message.trim() || !status.files.length} onPress={() => void commit(false)} />
                  <Button className="flex-1" label="Commit & push" disabled={Boolean(running) || !message.trim() || !status.files.length || !status.hasRemote} onPress={() => void commit(true)} />
                </View>
                <Text variant="caption">{"Write message asks the computer's title model, on the computer's Phaseo account, as the window's does."}</Text>
              </View>
            </Section>
            <Section title="Sync">
              <Row icon={ArrowUpFromLine} title="Push" subtitle={canPush(status) ? null : !status.hasRemote ? "This repository has no remote." : "Nothing to push."} onPress={canPush(status) && !running ? () => void act("push", { action: "push" }, "Pushed") : undefined} chevron={false} />
              <Row icon={ArrowDownToLine} title="Pull" subtitle={canPull(status) ? null : "This branch has no upstream to pull from."} onPress={canPull(status) && !running ? () => void act("pull", { action: "pull" }, "Pulled") : undefined} chevron={false} />
              <Row icon={GitBranchPlus} title="Switch or create branch" onPress={running ? undefined : openBranches} last />
            </Section>
          </>
        )}
        <Section title="Pull request">
          {status.pullRequest ? (
            <Row icon={GitPullRequest} title={`#${status.pullRequest.number} ${status.pullRequest.title}`} subtitle={[status.pullRequest.draft ? "Draft" : STATE_WORDS[status.pullRequest.state], status.pullRequest.repository].join(" · ")} onPress={() => router.push(desktopPullRequestHref(desktopId, projectId, status.pullRequest!.number))} />
          ) : writes ? (
            <Row icon={GitPullRequestCreate} title="Create pull request" subtitle={!status.hasRemote ? "Push this branch to a GitHub remote first." : "The computer's title model writes its title and description, as the window's does."} onPress={status.hasRemote && !running ? () => void createPullRequest() : undefined} chevron={false} />
          ) : status.pullRequest === null ? <Row icon={GitPullRequest} title="No pull request for this branch" /> : null}
          {status.hasRemote ? <Row icon={List} title="All pull requests" onPress={() => router.push(desktopPullRequestsHref(desktopId, projectId, where))} last /> : null}
        </Section>
      </ScrollView>
    );

  return (
    <Screen>
      <Header back title={title} subtitle={subtitle} right={<IconButton icon={RefreshCw} label="Refresh" onPress={loading || running ? undefined : reload} />} />
      <ConnectionNotice client={client} />
      {body}
      <Sheet open={branchSheet} onClose={() => setBranchSheet(false)}>
        <ScrollView className="max-h-[480px]" keyboardShouldPersistTaps="handled">
          <View className="gap-1 px-4 pb-2 pt-4">
            <Text variant="heading">Branches</Text>
            {status?.files.length ? <Text variant="caption">{"Commit your changes first: the computer won't switch with uncommitted work."}</Text> : null}
          </View>
          {branches.error ? <Text variant="caption" className="px-4 py-2 text-destructive">{branches.error}</Text> : !branches.refs ? <SkeletonRows count={3} /> : (
            <>
              <Row icon={GitBranch} title={branches.refs.current || "Not on a branch"} subtitle="Current branch" selected />
              {switchableBranches(branches.refs).map((name, index, all) => <Row key={name} icon={GitBranch} title={name} onPress={() => void switchTo(name)} chevron={false} last={index === all.length - 1} />)}
            </>
          )}
          <View className="gap-2 px-4 pb-4 pt-4">
            <Text variant="small" className="font-semibold">New branch from here</Text>
            <TextField value={newBranch} onChangeText={setNewBranch} placeholder="fix/usage-total" autoCapitalize="none" autoCorrect={false} accessibilityLabel="New branch name" />
            <Button label="Create branch" disabled={!newBranch.trim() || /\s/.test(newBranch.trim())} onPress={() => void create()} />
          </View>
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

/** While an action runs on the computer, what it's doing; after one fails, git's or GitHub's own words. */
export function Progress({ running, error, spinner, onDismiss }: { running: string | null; error: GitError | null; spinner: string; onDismiss(): void }) {
  if (running) {
    return (
      <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <ActivityIndicator size={14} color={spinner} />
        <Text variant="small">{running}</Text>
      </View>
    );
  }
  if (!error) return null;
  return (
    <View accessibilityRole="alert" className="flex-row items-start gap-2 border-b border-border px-4 py-3">
      <Text variant="small" className="flex-1 text-destructive" selectable>{error.code === "forbidden" ? "Making changes was turned off for this phone on the computer." : error.message}</Text>
      <Button label="Dismiss" variant="ghost" size="sm" onPress={onDismiss} />
    </View>
  );
}
