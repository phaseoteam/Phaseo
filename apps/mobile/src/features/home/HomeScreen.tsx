import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { Columns3, MessageSquare, Search, Server, UserRound, Wallet } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, Header, Icon, IconButton, ReadableWidth, Row, Screen, Section, Skeleton, Text } from "@/components/ui";
import { searchFocusStore, useCatalogue } from "@/features/models/state";
import { getBalance } from "@/lib/api/account";
import { getReleases, type ModelRelease } from "@/lib/api/models";
import { isOnPhaseo, modelName, organisationName } from "@/lib/catalogue";
import { formatCompact, formatRelativeDay, formatUsd } from "@/lib/format";
import { useAppearance } from "@/providers/AppearanceProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";

// One label per release, most useful first: "Released" beats "Announced" when both apply.
// Upcoming entries (mostly retirements) read in the future tense.
const RELEASE_TYPES: [string, string, string][] = [["added", "Added to Phaseo", "Coming to Phaseo"], ["released", "Released", "Releases"], ["announced", "Announced", "Announcement"], ["deprecated", "Deprecated", "Deprecated"], ["retired", "Retired", "Retires"]];
// The feed sends display-cased types ("Released", "Retired"); compare in one form.
const typeKey = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");
const releaseLabel = (types: string[], upcoming: boolean) => {
  const match = RELEASE_TYPES.find(([type]) => types.some((value) => typeKey(value) === type));
  return match ? match[upcoming ? 2 : 1] : "Update";
};
const isNewRelease = (release: ModelRelease) => release.types.some((value) => ["released", "added", "announced"].includes(typeKey(value)));

export function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const catalogue = useCatalogue();
  const releases = useQuery({ queryKey: ["public", "releases"], queryFn: getReleases, staleTime: 10 * 60 * 1000 });
  const trending = useMemo(
    () => (catalogue.data?.models ?? []).filter((model) => isOnPhaseo(model) && (model.popularity_tokens_week ?? 0) > 0).sort((a, b) => (b.popularity_tokens_week ?? 0) - (a.popularity_tokens_week ?? 0)).slice(0, 6),
    [catalogue.data],
  );

  return (
    <Screen>
      <Header
        large
        title="Phaseo"
        leading={<PhaseoMark />}
        right={(
          <>
            {session ? <BalancePill /> : null}
            <IconButton icon={UserRound} label={session ? "Account" : "Sign in"} onPress={() => router.navigate(session ? "/account" : "/sign-in")} />
          </>
        )}
      />
      <ScrollView contentContainerClassName="pb-16" keyboardShouldPersistTaps="handled">
        <ReadableWidth>
          <HomeSearch count={catalogue.data?.models.length} />
          {session ? null : <SignedOutIntro />}

          <View className="mt-4 flex-row gap-2 px-4">
            <QuickAction label="Chat" icon={MessageSquare} href="/chat" />
            <QuickAction label="Compare" icon={Columns3} href="/compare" />
            <QuickAction label="Providers" icon={Server} href="/providers" />
          </View>

          <Section title="Latest releases" action={<Link href="/models" asChild><Pressable hitSlop={8} className="shrink-0"><Text variant="small" numberOfLines={1} className="font-semibold text-link">All models</Text></Pressable></Link>}>
            {releases.isLoading ? <ReleaseSkeleton /> : (releases.data?.past ?? []).filter(isNewRelease).slice(0, 8).map((release, index, list) => <ReleaseRow key={`${release.model.model_id}-${release.date}`} release={release} last={index === list.length - 1} />)}
          </Section>

          {releases.data?.future.length ? (
            <Section title="Coming up">
              {releases.data.future.slice(0, 5).map((release, index, list) => <ReleaseRow key={`${release.model.model_id}-${release.date}`} release={release} last={index === list.length - 1} upcoming />)}
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

function PhaseoMark() {
  const { resolved } = useAppearance();
  // The "light" asset is a white mark on black, for the dark theme, and the reverse.
  const source = resolved === "dark" ? require("../../../assets/phaseo-logo-light.png") : require("../../../assets/phaseo-logo-dark.png");
  return (
    <View className="overflow-hidden border border-border" style={{ width: 30, height: 30, borderRadius: 8 }}>
      <Image source={source} style={{ width: "100%", height: "100%" }} accessibilityLabel="Phaseo" />
    </View>
  );
}

/** Looks like a search field; opens Models with its search field focused. */
function HomeSearch({ count }: { count?: number }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Search models"
      onPress={() => { searchFocusStore.set((value) => value + 1); router.navigate("/models"); }}
      className="mx-4 mt-1 h-11 flex-row items-center gap-2 rounded-md bg-muted px-3 active:opacity-80"
    >
      <Icon icon={Search} tone="muted" size={17} />
      <Text variant="body" className="text-muted-foreground" numberOfLines={1}>{count ? `Search ${count.toLocaleString()} models, labs or IDs` : "Search models, labs or IDs"}</Text>
    </Pressable>
  );
}

function SignedOutIntro() {
  const router = useRouter();
  return (
    <View className="px-4 pt-4">
      <Text variant="body" className="text-muted-foreground">Prices, providers, benchmarks and releases for every model, with one API to use them.</Text>
      <View className="mt-4 flex-row gap-2">
        <Button label="Sign in" className="flex-1" onPress={() => router.push("/sign-in")} />
        <Button label="Browse models" variant="outline" className="flex-1" onPress={() => router.navigate("/models")} />
      </View>
    </View>
  );
}

/** The workspace's credit balance, small, in the header. Opens usage. */
function BalancePill() {
  const router = useRouter();
  const { workspace, workspaceId } = useWorkspace();
  const balance = useQuery({ queryKey: ["account", workspaceId, "balance"], queryFn: () => getBalance(workspaceId!), enabled: Boolean(workspaceId) });
  if (!workspaceId) return null;
  if (balance.isLoading) return <Skeleton className="mr-1 h-8 w-20 rounded-md" />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${workspace?.name ?? "Workspace"} credit balance ${formatUsd(balance.data)}. Opens usage.`}
      onPress={() => router.navigate("/account/usage")}
      className="mr-1 h-8 flex-row items-center gap-1.5 rounded-md bg-secondary px-3 active:bg-accent"
    >
      <Icon icon={Wallet} tone="muted" size={14} />
      <Text variant="small" className="font-semibold">{formatUsd(balance.data)}</Text>
    </Pressable>
  );
}

function QuickAction({ label, icon, href }: { label: string; icon: typeof MessageSquare; href: "/chat" | "/compare" | "/providers" }) {
  const router = useRouter();
  return <Button label={label} icon={icon} variant="secondary" className="flex-1" onPress={() => router.navigate(href)} />;
}

function ReleaseRow({ release, last, upcoming }: { release: ModelRelease; last: boolean; upcoming?: boolean }) {
  const router = useRouter();
  const type = releaseLabel(release.types, Boolean(upcoming));
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
