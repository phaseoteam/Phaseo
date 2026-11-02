import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
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

// Phones list a few of each so the catalogue starts within a scroll or two; the catalogue below is sorted newest
// first by default, so it carries on where Latest releases stops. The tablet's detail pane has room for more.
const PHONE_COUNTS = { latest: 5, upcoming: 3, trending: 5 };
const SPLIT_COUNTS = { latest: 8, upcoming: 5, trending: 6 };

/**
 * The top of Models: a way to sign in, the latest and coming releases and the most used models. Above the list on
 * phones, until a search or filter (then the matches come first); on split layouts it fills the detail pane until
 * a model is chosen. Compare, Providers and Usage are in the sidebar, which every screen opens.
 */
export function ModelsSummary() {
  const router = useRouter();
  const { split } = useLayout();
  const { session } = useAuth();
  const counts = split ? SPLIT_COUNTS : PHONE_COUNTS;
  const catalogue = useCatalogue();
  const releases = useQuery({ queryKey: ["public", "releases"], queryFn: getReleases, staleTime: 10 * 60 * 1000 });
  const trending = useMemo(
    () => (catalogue.data?.models ?? []).filter((model) => isOnPhaseo(model) && (model.popularity_tokens_week ?? 0) > 0).sort((a, b) => (b.popularity_tokens_week ?? 0) - (a.popularity_tokens_week ?? 0)).slice(0, counts.trending),
    [catalogue.data, counts.trending],
  );

  return (
    <View className="pb-2">
      {session ? null : (
        <View className="px-4 pt-5">
          <Text variant="body" className="text-muted-foreground">Prices, providers, benchmarks and releases for every model, with one API to use them.</Text>
          <Button label="Sign in to chat" className="mt-4" onPress={() => router.push("/sign-in")} />
        </View>
      )}

      <Section title="Latest releases" className={split ? undefined : "mt-5"}>
        {releases.isLoading ? <ReleaseSkeleton /> : onePerModel((releases.data?.past ?? []).filter(isNewRelease)).slice(0, counts.latest).map((release, index, list) => <ReleaseRow key={`${release.model.model_id}-${release.date}`} release={release} last={index === list.length - 1} />)}
      </Section>

      {releases.data?.future.length ? (
        <Section title="Coming up" className="mt-8">
          {releases.data.future.slice(0, counts.upcoming).map((release, index, list) => <ReleaseRow key={`${release.model.model_id}-${release.date}`} release={release} last={index === list.length - 1} upcoming />)}
        </Section>
      ) : null}

      {trending.length ? (
        <Section title="Most used this week" description="By tokens through Phaseo." className="mt-8">
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
