import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, Row, Section, Skeleton, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { getReleases, type ModelRelease } from "@/lib/api/models";
import { formatCalendarDate } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { onePerModel } from "./releases";

// One label per release, most useful first: "Released" beats "Announced" when both apply.
// Only new models are listed; retirements and deprecations are left out.
const RELEASE_TYPES: [string, string][] = [["added", "Added to Phaseo"], ["released", "Released"], ["announced", "Announced"]];
// The feed sends display-cased types ("Released", "Retired"); compare in one form.
const typeKey = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");
const releaseLabel = (release: ModelRelease) => RELEASE_TYPES.find(([type]) => release.types.some((value) => typeKey(value) === type))?.[1];

// Phones list a few so the catalogue starts within a scroll; the catalogue below is sorted newest first by default,
// so it carries on where Latest releases stops. The tablet's detail pane has room for more.
const PHONE_LATEST = 5;
const SPLIT_LATEST = 8;

/**
 * The top of Models: a way to sign in and the latest releases. Above the list on
 * phones, until a search or filter (then the matches come first); on split layouts it fills the detail pane until
 * a model is chosen. Compare, Providers and Usage are in the sidebar, which every screen opens.
 */
export function ModelsSummary() {
  const router = useRouter();
  const { split } = useLayout();
  const { session } = useAuth();
  const latest = split ? SPLIT_LATEST : PHONE_LATEST;
  const releases = useQuery({ queryKey: ["public", "releases"], queryFn: getReleases, staleTime: 10 * 60 * 1000 });

  return (
    <View className="pb-2">
      {session ? null : (
        <View className="px-4 pt-5">
          <Text variant="body" className="text-muted-foreground">Prices, providers, benchmarks and releases for every model, with one API to use them.</Text>
          <Button label="Sign in to chat" className="mt-4" onPress={() => router.push("/sign-in")} />
        </View>
      )}

      <Section title="Latest releases" className={split ? undefined : "mt-5"}>
        {releases.isLoading ? <ReleaseSkeleton /> : onePerModel((releases.data?.past ?? []).filter((release) => releaseLabel(release))).slice(0, latest).map((release, index, list) => <ReleaseRow key={`${release.model.model_id}-${release.date}`} release={release} last={index === list.length - 1} />)}
      </Section>
    </View>
  );
}

/** As the website's releases list: "Today" on the day of release in UTC, otherwise the date. */
function releaseDay(date: string) {
  const time = Date.parse(date);
  const today = Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  return today ? "Today" : formatCalendarDate(date, "—");
}

function ReleaseRow({ release, last }: { release: ModelRelease; last: boolean }) {
  const router = useRouter();
  const type = releaseLabel(release) ?? "Update";
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
