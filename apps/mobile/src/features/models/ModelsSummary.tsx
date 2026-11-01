import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChartNoAxesColumn, Columns3, Server, UserRound, type LucideIcon } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, Row, Section, Skeleton, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { getReleases, type ModelRelease } from "@/lib/api/models";
import { isOnPhaseo, modelName, organisationName } from "@/lib/catalogue";
import { formatCalendarDate, formatCompact } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { onePerModel } from "./releases";
import { useCatalogue } from "./state";

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

/**
 * The top of Models: a way to sign in, the latest and coming releases and the most used models. Above the list on
 * phones; on split layouts it fills the detail pane until a model is chosen.
 */
export function ModelsSummary() {
  const router = useRouter();
  const { split } = useLayout();
  const { session } = useAuth();
  const catalogue = useCatalogue();
  const releases = useQuery({ queryKey: ["public", "releases"], queryFn: getReleases, staleTime: 10 * 60 * 1000 });
  const trending = useMemo(
    () => (catalogue.data?.models ?? []).filter((model) => isOnPhaseo(model) && (model.popularity_tokens_week ?? 0) > 0).sort((a, b) => (b.popularity_tokens_week ?? 0) - (a.popularity_tokens_week ?? 0)).slice(0, 6),
    [catalogue.data],
  );

  return (
    <View className="pb-2">
      {session ? null : (
        <View className="px-4 pt-2">
          <Text variant="body" className="text-muted-foreground">Prices, providers, benchmarks and releases for every model, with one API to use them.</Text>
          <Button label="Sign in to chat" className="mt-4" onPress={() => router.push("/sign-in")} />
        </View>
      )}

      {/* Split layouts have these in the sidebar. */}
      {split ? null : (
        <View className="mt-4 flex-row gap-2 px-4">
          <QuickLink label="Compare" icon={Columns3} href="/compare" />
          <QuickLink label="Providers" icon={Server} href="/providers" />
          {session ? <QuickLink label="Usage" icon={ChartNoAxesColumn} href="/account/usage" /> : <QuickLink label="Account" icon={UserRound} href="/account" />}
        </View>
      )}

      <Section title="Latest releases">
        {releases.isLoading ? <ReleaseSkeleton /> : onePerModel((releases.data?.past ?? []).filter(isNewRelease)).slice(0, 8).map((release, index, list) => <ReleaseRow key={`${release.model.model_id}-${release.date}`} release={release} last={index === list.length - 1} />)}
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
    </View>
  );
}

function QuickLink({ label, icon, href }: { label: string; icon: LucideIcon; href: "/compare" | "/providers" | "/account/usage" | "/account" }) {
  const router = useRouter();
  return <Button label={label} icon={icon} variant="secondary" className="flex-1" onPress={() => router.push(href)} />;
}

/** As the website's releases list: "Today" on the day of release in UTC, otherwise the date. */
function releaseDay(date: string) {
  const time = Date.parse(date);
  const today = Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  return today ? "Today" : formatCalendarDate(date, "—");
}

function ReleaseRow({ release, last, upcoming }: { release: ModelRelease; last: boolean; upcoming?: boolean }) {
  const router = useRouter();
  const type = releaseLabel(release.types, Boolean(upcoming));
  const org = release.model.organisation?.name ?? release.model.organisation_name ?? release.model.model_id.split("/")[0];
  return (
    <Row
      leading={<Logo id={release.model.organisation_id ?? release.model.model_id.split("/")[0]} label={org} size={30} />}
      title={release.model.name ?? release.model.model_id}
      subtitle={`${type} · ${releaseDay(release.date)}`}
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
