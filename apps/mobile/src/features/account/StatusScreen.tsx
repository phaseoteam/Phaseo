import { ExternalLink } from "lucide-react-native";
import { RefreshControl, ScrollView, View } from "react-native";
import { Button, EmptyState, ErrorState, Header, LoadingState, ReadableWidth, Row, Screen, Section, Text, useToneColor } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { formatRelativeDay } from "@/lib/format";
import { openWeb } from "@/lib/web";
import { useStatus } from "./queries";

const TONES: Record<string, "success" | "warning" | "destructive" | "link" | "muted"> = {
  operational: "success",
  monitoring: "warning",
  degraded: "warning",
  partial_outage: "warning",
  major_outage: "destructive",
  maintenance: "link",
};

/** A coloured square for a status-page state (green, amber, red, blue, grey). */
export function StatusDot({ state, size = 10 }: { state: string; size?: number }) {
  const colour = useToneColor(TONES[state] ?? "muted");
  return <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: Math.max(2, Math.round(size / 4)), backgroundColor: colour }} />;
}

/** A service's state in a word or two (the page's own label is a sentence for the whole site). */
const SHORT: Record<string, string> = { operational: "Operational", monitoring: "Monitoring", degraded: "Degraded", partial_outage: "Partial outage", major_outage: "Major outage", maintenance: "Maintenance" };

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** What phaseo.app/status shows, from the same source: the overall state, open incidents and each service. */
export function StatusScreen() {
  const { split } = useLayout();
  const status = useStatus();
  const data = status.data;
  return (
    <Screen>
      <Header back={!split} title="Status" />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={status.isRefetching} onRefresh={() => void status.refetch()} />}>
        <ReadableWidth>
          {status.isLoading ? <LoadingState /> : status.isError || !data ? <ErrorState error={status.error} onRetry={() => void status.refetch()} /> : (
            <>
              <View className="flex-row items-center gap-3 px-4 pt-2" accessibilityRole="summary">
                <StatusDot state={data.state} size={14} />
                <View className="flex-1">
                  <Text variant="title">{data.label}</Text>
                  <Text variant="caption">{`Checked at ${time.format(status.dataUpdatedAt)} · updates every minute`}</Text>
                </View>
              </View>
              {data.incidents.length ? (
                <Section title="Open incidents">
                  {data.incidents.map((incident, index) => (
                    <View key={incident.id || index} className="gap-1 border-b border-border px-4 py-3">
                      <View className="flex-row items-center gap-2">
                        <StatusDot state={incident.impactState ?? "degraded"} />
                        <Text variant="label" className="flex-1">{incident.name}</Text>
                      </View>
                      <Text variant="caption">{[incident.impact, incident.status ? incident.status.replace(/_/g, " ") : null, incident.updatedAt ? `updated ${formatRelativeDay(incident.updatedAt).toLowerCase()} at ${time.format(Date.parse(incident.updatedAt))}` : null].filter(Boolean).join(" · ")}</Text>
                      {incident.message ? <Text variant="small">{incident.message}</Text> : null}
                    </View>
                  ))}
                </Section>
              ) : null}
              <Section title="Services">
                {data.components.length ? data.components.map((component, index) => (
                  <Row
                    key={`${component.parent ?? ""}${component.name}`}
                    title={component.name}
                    subtitle={component.parent}
                    trailing={<View className="flex-row items-center gap-1.5"><StatusDot state={component.state} /><Text variant="muted">{SHORT[component.state] ?? component.label ?? "Unknown"}</Text></View>}
                    last={index === data.components.length - 1}
                  />
                )) : <EmptyState title="No services listed" body="The status page didn't list its services just now." />}
              </Section>
              <View className="px-4 pt-6">
                <Button label="Open the status page" icon={ExternalLink} variant="outline" onPress={() => void openWeb(data.href)} />
              </View>
            </>
          )}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
