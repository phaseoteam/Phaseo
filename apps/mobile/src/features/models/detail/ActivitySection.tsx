import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { ChevronRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { LegendItem, StackedBarChart, TooltipRow, TooltipTitle } from "@/components/charts";
import { Icon, Select, Text } from "@/components/ui";
import { getModelActivity, getModelApps } from "@/lib/api/models";
import { cn } from "@/lib/cn";
import { WEB_ORIGIN } from "@/lib/config";
import { formatCompact, formatNumber, formatShortDate } from "@/lib/format";
import { ACTIVITY_SERIES, activityDays, activityTotal, type ActivityDay, type ActivityMode } from "./activity";
import { PageSection } from "./parts";
import type { SectionId } from "./sections";

/** "Token volume and request traffic for this model over time": 30 UTC days, stacked prompt/reasoning/completion. */
export function ActivitySection({ modelId, onLayoutSection, first }: { modelId: string; onLayoutSection: (id: SectionId, y: number) => void; first?: boolean }) {
  const usage = useQuery({ queryKey: ["model-page", modelId, "usage-daily"], queryFn: () => getModelActivity(modelId, 30), staleTime: 15 * 60_000 });
  const [mode, setMode] = useState<ActivityMode>("tokens");
  const days = useMemo(() => activityDays(usage.data ?? [], mode), [usage.data, mode]);
  // As on the website, the section is left out until the model has usage rows.
  if (!usage.data?.length) return null;
  const series = mode === "tokens" ? [ACTIVITY_SERIES.prompt, ACTIVITY_SERIES.reasoning, ACTIVITY_SERIES.completion] : [ACTIVITY_SERIES.requests];
  const dayName = (day: ActivityDay) => `${formatShortDate(`${day.day}T00:00:00Z`)}${day.isToday ? " · so far" : ""}`;
  const total = days.reduce((sum, day) => sum + activityTotal(day, mode), 0);
  return (
    <PageSection
      id="activity"
      first={first}
      onLayoutSection={onLayoutSection}
      title="Activity"
      description="Token volume and request traffic for this model over time."
      action={<Select className="w-40" size="sm" title="Metric" value={mode} options={[{ value: "tokens", label: "Tokens" }, { value: "requests", label: "Requests" }]} onChange={(value) => setMode(value)} />}
    >
      <Text variant="caption" className="mb-2">Press and hold the chart, then drag, to see a day.</Text>
      <StackedBarChart
        height={240}
        yFormat={(value) => formatCompact(value)}
        bars={days.map((entry) => ({
          key: entry.day,
          segments: mode === "tokens"
            ? [{ value: entry.prompt, colour: ACTIVITY_SERIES.prompt.colour }, { value: entry.reasoning, colour: ACTIVITY_SERIES.reasoning.colour }, { value: entry.completion, colour: ACTIVITY_SERIES.completion.colour }]
            : [{ value: entry.requests, colour: ACTIVITY_SERIES.requests.colour }],
          projected: entry.projected,
        }))}
        xLabel={(index) => formatShortDate(`${days[index]!.day}T00:00:00Z`)}
        accessibilityLabel={`${mode === "tokens" ? "Tokens" : "Requests"} per day for the last ${days.length} days, ${formatCompact(total)} in total`}
        describe={(index) => {
          const day = days[index]!;
          return mode === "tokens"
            ? `${dayName(day)}: ${formatCompact(day.prompt)} prompt, ${formatCompact(day.reasoning)} reasoning, ${formatCompact(day.completion)} completion tokens`
            : `${dayName(day)}: ${formatNumber(day.requests)} requests`;
        }}
        tooltip={(index) => {
          const day = days[index]!;
          return (
            <>
              <TooltipTitle>{dayName(day)}</TooltipTitle>
              {mode === "tokens" ? (
                <>
                  <TooltipRow colour={ACTIVITY_SERIES.prompt.colour} label="Prompt" value={formatCompact(day.prompt)} />
                  <TooltipRow colour={ACTIVITY_SERIES.reasoning.colour} label="Reasoning" value={formatCompact(day.reasoning)} />
                  <TooltipRow colour={ACTIVITY_SERIES.completion.colour} label="Completion" value={formatCompact(day.completion)} />
                </>
              ) : <TooltipRow colour={ACTIVITY_SERIES.requests.colour} label="Requests" value={formatNumber(day.requests)} />}
              {day.projected > 0 ? <TooltipRow label="Projected" value={formatCompact(activityTotal(day, mode) + day.projected)} /> : null}
            </>
          );
        }}
      />
      <View className="mt-3 flex-row flex-wrap gap-x-5 gap-y-1.5 border-t border-border pt-3">
        {series.map((entry) => <LegendItem key={entry.label} colour={entry.colour} label={entry.label} dot />)}
      </View>
    </PageSection>
  );
}

function appLogo(app: { imageUrl?: string | null; url?: string | null }) {
  if (app.imageUrl) return app.imageUrl;
  try {
    const host = app.url ? new URL(app.url).hostname.replace(/^www\./, "") : null;
    return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : null;
  } catch {
    return null;
  }
}

const hostOf = (url?: string | null) => {
  try { return url ? new URL(url).hostname.replace(/^www\./, "") : null; } catch { return null; }
};

/** "Apps using this model": the top ten public apps by tokens. Hidden when there are none, as on the website. */
export function AppsSection({ modelId, onLayoutSection, first }: { modelId: string; onLayoutSection: (id: SectionId, y: number) => void; first?: boolean }) {
  const apps = useQuery({ queryKey: ["model-page", modelId, "apps"], queryFn: () => getModelApps(modelId), staleTime: 30 * 60_000 });
  const top = (apps.data ?? []).slice(0, 10);
  if (!top.length) return null;
  return (
    <PageSection id="apps" first={first} onLayoutSection={onLayoutSection} title="Apps using this model" description="Public apps observed in gateway usage for this model.">
      {top.map((app, index) => {
        const logo = appLogo(app);
        const host = hostOf(app.url);
        return (
          <Pressable key={app.appId} accessibilityRole="link" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/apps/${encodeURIComponent(app.appId)}`)} className={cn("min-h-12 flex-row items-center gap-2.5 py-1.5 active:bg-accent", index < top.length - 1 && "border-b border-border")}>
            <Text variant="small" className="w-6 text-muted-foreground">{index + 1}.</Text>
            <View className="h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-muted">
              {logo ? <Image source={{ uri: logo }} style={{ width: 28, height: 28 }} contentFit="contain" cachePolicy="disk" /> : <Text variant="caption" className="font-semibold">{app.title.trim().charAt(0).toUpperCase() || "A"}</Text>}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1">
                <Text variant="small" numberOfLines={1} className="shrink font-semibold">{app.title}</Text>
                <Icon icon={ChevronRight} tone="muted" size={14} />
              </View>
              {host ? <Text variant="caption" numberOfLines={1}>{host}</Text> : null}
            </View>
            <Text variant="small" className="text-muted-foreground">{formatCompact(app.totalTokens)} tokens</Text>
          </Pressable>
        );
      })}
    </PageSection>
  );
}
