import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { Columns3, MessageSquare, Server, UserRound } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, Header, IconButton, ReadableWidth, Row, Screen, Section, Skeleton, Text } from "@/components/ui";
import { useCatalogue } from "@/features/models/state";
import { getBalance } from "@/lib/api/account";
import { getReleases, type ModelRelease } from "@/lib/api/models";
import { isOnPhaseo, modelName, organisationName } from "@/lib/catalogue";
import { formatCompact, formatRelativeDay, formatUsd } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";

const RELEASE_TYPE: Record<string, string> = { released: "Released", added: "Added to Phaseo", announced: "Announced", deprecated: "Deprecated", retired: "Retired", coming_soon: "Coming soon" };

export function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const catalogue = useCatalogue();
  const releases = useQuery({ queryKey: ["public", "releases"], queryFn: getReleases, staleTime: 10 * 60 * 1000 });
  const trending = useMemo(
    () => (catalogue.data?.models ?? []).filter((model) => isOnPhaseo(model) && (model.popularity_tokens_week ?? 0) > 0).sort((a, b) => (b.popularity_tokens_week ?? 0) - (a.popularity_tokens_week ?? 0)).slice(0, 6),
    [catalogue.data],
  );
  const refresh = () => { void releases.refetch(); void catalogue.refetch(); };

  return (
    <Screen>
      <Header large title="Phaseo" right={<IconButton icon={UserRound} label={session ? "Account" : "Sign in"} onPress={() => router.navigate(session ? "/account" : "/sign-in")} />} />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={releases.isRefetching} onRefresh={refresh} />}>
        <ReadableWidth>
          {session ? <WorkspaceSummary /> : <SignedOutIntro />}

          <View className="mt-4 flex-row gap-2 px-4">
            <QuickAction label="Chat" icon={MessageSquare} href="/chat" />
            <QuickAction label="Compare" icon={Columns3} href="/compare" />
            <QuickAction label="Providers" icon={Server} href="/providers" />
          </View>

          <Section title="Latest releases" action={<Link href="/models" asChild><Pressable hitSlop={8}><Text variant="small" className="font-semibold text-primary">All models</Text></Pressable></Link>}>
            {releases.isLoading ? <ReleaseSkeleton /> : (releases.data?.past ?? []).slice(0, 8).map((release, index, list) => <ReleaseRow key={`${release.model.model_id}-${release.date}`} release={release} last={index === list.length - 1} />)}
          </Section>

          {releases.data?.future.length ? (
            <Section title="Coming up">
              {releases.data.future.slice(0, 5).map((release, index, list) => <ReleaseRow key={`${release.model.model_id}-${release.date}`} release={release} last={index === list.length - 1} />)}
            </Section>
          ) : null}

          {trending.length ? (
            <Section title="Most used this week" description="By tokens through Phaseo.">
              {trending.map((model, index) => (
                <Row
                  key={model.model_id}
                  leading={<Logo id={model.organisation_id} label={organisationName(model)} colour={model.organisation_colour} size={30} />}
                  title={modelName(model)}
                  subtitle={`${organisationName(model)} · ${formatCompact(model.popularity_tokens_week)} tokens`}
                  onPress={() => router.push(`/models/${model.model_id}`)}
                  last={index === trending.length - 1}
                />
              ))}
            </Section>
          ) : null}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}

function SignedOutIntro() {
  const router = useRouter();
  return (
    <View className="px-4 pt-2">
      <Text variant="body" className="text-muted-foreground">Prices, providers, benchmarks and releases for every model, with one API to use them.</Text>
      <View className="mt-4 flex-row gap-2">
        <Button label="Sign in" className="flex-1" onPress={() => router.push("/sign-in")} />
        <Button label="Browse models" variant="outline" className="flex-1" onPress={() => router.navigate("/models")} />
      </View>
    </View>
  );
}

function WorkspaceSummary() {
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const balance = useQuery({ queryKey: ["account", workspaceId, "balance"], queryFn: () => getBalance(workspaceId!), enabled: Boolean(workspaceId) });
  return (
    <Pressable onPress={() => router.navigate("/account/usage")} className="mx-4 mt-1 border-b border-border pb-4 active:opacity-80">
      <Text variant="caption">{workspace?.name ?? "Workspace"}</Text>
      {balance.isLoading ? <Skeleton className="mt-1 h-8 w-32" /> : <Text variant="display" className="mt-0.5">{formatUsd(balance.data)}</Text>}
      <Text variant="muted">Credit balance · Tap for usage</Text>
    </Pressable>
  );
}

function QuickAction({ label, icon, href }: { label: string; icon: typeof MessageSquare; href: "/chat" | "/compare" | "/providers" }) {
  const router = useRouter();
  return <Button label={label} icon={icon} variant="secondary" className="flex-1" onPress={() => router.navigate(href)} />;
}

function ReleaseRow({ release, last }: { release: ModelRelease; last: boolean }) {
  const router = useRouter();
  const type = release.types.map((value) => RELEASE_TYPE[value] ?? value).join(", ") || "Update";
  const org = release.model.organisation?.name ?? release.model.organisation_name ?? release.model.model_id.split("/")[0];
  return (
    <Row
      leading={<Logo id={release.model.organisation_id ?? release.model.model_id.split("/")[0]} label={org} size={30} />}
      title={release.model.name ?? release.model.model_id}
      subtitle={`${type} · ${formatRelativeDay(release.date)}`}
      onPress={() => router.push(`/models/${release.model.model_id}`)}
      last={last}
    />
  );
}

function ReleaseSkeleton() {
  return (
    <View className="gap-4 px-4 py-3">
      {[0, 1, 2].map((index) => <Skeleton key={index} className="h-10" />)}
    </View>
  );
}
