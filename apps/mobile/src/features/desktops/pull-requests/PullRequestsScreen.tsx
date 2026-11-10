import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import { GitPullRequest, RefreshCw, ShieldOff } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Button, Chip, ChipRow, EmptyState, ErrorState, Header, IconButton, Row, Screen, SkeletonRows } from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";
import type { DesktopClient } from "../client";
import { ConnectionNotice } from "../CodeThreadList";
import { clientFor } from "../connections";
import { useDesktopProjects } from "../hooks";
import type { PhonePullRequest } from "../protocol";
import { desktopPullRequestHref } from "../routes";
import { useDesktop } from "../store";
import { checksWords, reviewWords } from "../git/gitState";
import { usePullRequests } from "./hooks";

/** A computer's open pull requests in one of its repositories, read through the computer's own GitHub sign-in. */
export function PullRequestsScreen({ desktopId, projectId }: { desktopId: string; projectId: string | null }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  if (desktop === undefined) return <Screen><Header back title="Pull requests" /><SkeletonRows count={5} /></Screen>;
  if (!desktop || !client) return <Screen><Header back title="Pull requests" /><EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." /></Screen>;
  return <PullRequests client={client} desktopId={desktopId} initialProject={projectId} desktopName={desktop.desktopName} />;
}

/** One row: number and title, then branch, author, when, and the review and checks words the window shows. */
export const pullRequestSubtitle = (pr: PhonePullRequest, now = Date.now()) =>
  [`#${pr.number}`, pr.head, pr.author, formatRelativeTime(Math.min(Date.parse(pr.updatedAt), now), now), reviewWords[pr.review], checksWords[pr.checks]].filter(Boolean).join(" · ");

function PullRequests({ client, desktopId, initialProject, desktopName }: { client: DesktopClient; desktopId: string; initialProject: string | null; desktopName: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const projects = useDesktopProjects(client);
  // Only checkouts that aren't worktrees: a worktree's pull requests are its project's.
  const choices = (projects ?? []).filter((project) => project.repository && !project.worktreeOf && !project.archived);
  const [picked, setPicked] = useState(initialProject);
  const projectId = picked ?? choices[0]?.id ?? null;
  const { allowed, repository, rows, error, loading, reload, more, limitReached } = usePullRequests(client, projectId);

  const body = !allowed ? <EmptyState className="flex-1" icon={ShieldOff} title="Reading code is off for this phone" body="Turn on Read code for this phone on the computer, in Settings → Phone." />
    : projects && !choices.length ? <EmptyState className="flex-1" icon={GitPullRequest} title="No repositories" body="None of this computer's projects is a git checkout." />
    : error && !rows ? <ErrorState className="flex-1" error={new Error(error.message)} onRetry={reload} />
    : !rows ? <SkeletonRows count={6} />
    : !rows.length ? <EmptyState className="flex-1" icon={GitPullRequest} title="No open pull requests" body={repository ? `${repository} has none open.` : undefined} />
    : (
      <LegendList
        data={rows}
        keyExtractor={(pr) => String(pr.number)}
        estimatedItemSize={72}
        renderItem={({ item }) => (
          <Row title={item.title} subtitle={pullRequestSubtitle(item)} numberOfLines={2} trailing={item.draft ? <Badge label="Draft" /> : null} onPress={() => router.push(desktopPullRequestHref(desktopId, projectId!, item.number))} />
        )}
        ListFooterComponent={more ? <View className="p-4"><Button label="Show more" variant="outline" loading={loading} onPress={more} /></View> : limitReached ? <Row title="More are open than the phone lists. See them on GitHub." /> : null}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
    );

  return (
    <Screen>
      <Header back title="Pull requests" subtitle={[repository, desktopName].filter(Boolean).join(" · ")} right={allowed ? <IconButton icon={RefreshCw} label="Refresh" onPress={loading ? undefined : reload} /> : null} />
      <ConnectionNotice client={client} />
      {choices.length > 1 ? (
        <ChipRow className="pb-2">
          {choices.map((project) => <Chip key={project.id} label={project.name} selected={project.id === projectId} onPress={() => setPicked(project.id)} />)}
        </ChipRow>
      ) : null}
      {body}
    </Screen>
  );
}
