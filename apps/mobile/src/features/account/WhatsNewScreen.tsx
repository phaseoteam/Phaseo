import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { Fragment } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Button, EmptyState, ErrorState, Header, LoadingState, ReadableWidth, Screen, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { getChangelogPage } from "@/lib/api/help";
import { WEB_ORIGIN } from "@/lib/config";
import { openWeb } from "@/lib/web";
import { mergeChangelogs, modelIdFromUrl, parseChangelog, previousMonth, type ChangelogEntry, type ChangelogSegment } from "./changelog";

/** Enough to cover a few weeks: the current month's page, plus the month before when it's short. */
const MIN_ENTRIES = 8;

async function loadChangelog(): Promise<ChangelogEntry[]> {
  const current = parseChangelog(await getChangelogPage());
  if (current.length >= MIN_ENTRIES) return mergeChangelogs([current]);
  const earliest = current.at(-1)?.time ?? Date.now();
  const archive = await getChangelogPage(previousMonth(earliest)).then(parseChangelog, () => []);
  return mergeChangelogs([current, archive]);
}

/** Recent product updates and model releases, from the docs changelog. */
export function WhatsNewScreen() {
  const router = useRouter();
  const { split } = useLayout();
  const changelog = useQuery({ queryKey: ["changelog"], queryFn: loadChangelog, staleTime: 30 * 60_000 });
  const open = (segment: ChangelogSegment) => {
    if (!segment.url) return;
    const modelId = modelIdFromUrl(segment.url, WEB_ORIGIN);
    if (modelId) router.push(`/models/${modelId}`);
    else void openWeb(segment.url);
  };
  return (
    <Screen>
      <Header back={!split} title="What's new" />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={changelog.isRefetching} onRefresh={() => void changelog.refetch()} />}>
        <ReadableWidth>
          {changelog.isLoading ? <LoadingState /> : changelog.isError ? <ErrorState error={changelog.error} onRetry={() => void changelog.refetch()} /> : !changelog.data?.length ? (
            <EmptyState title="Nothing new to show" body="The changelog is on phaseo.app." action="Open the changelog" onAction={() => void openWeb("/docs/v1/changelog")} />
          ) : (
            <>
              {changelog.data.map((entry) => (
                <View key={entry.date} className="border-b border-border px-4 py-4">
                  <Text variant="heading">{entry.date}</Text>
                  {entry.groups.map((group, groupIndex) => (
                    <View key={groupIndex} className="mt-2">
                      {group.title ? <Text variant="label" className="text-muted-foreground">{group.title}</Text> : null}
                      {group.items.map((item, itemIndex) => (
                        <View key={itemIndex} className="mt-1.5 flex-row gap-2">
                          <Text variant="body" className="text-muted-foreground">•</Text>
                          <Text variant="body" className="flex-1">
                            {item.map((segment, segmentIndex) => (
                              <Fragment key={segmentIndex}>
                                {segment.url ? <Text variant="body" className="text-link" accessibilityRole="link" onPress={() => open(segment)}>{segment.text}</Text> : segment.text}
                              </Fragment>
                            ))}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
              <View className="px-4 pt-6">
                <Button label="Full changelog" icon={ExternalLink} variant="outline" onPress={() => void openWeb("/docs/v1/changelog")} />
              </View>
            </>
          )}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
