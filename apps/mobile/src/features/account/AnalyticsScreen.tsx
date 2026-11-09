import { ScrollView } from "react-native";
import { Header, ReadableWidth, Row, Screen, Section, Switch, Text, toast } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { analyticsStore, setAppAnalyticsEnabled } from "@/lib/appAnalytics";

export function AnalyticsScreen() {
  const { split } = useLayout();
  const enabled = analyticsStore.use();
  const change = (value: boolean) => {
    if (!setAppAnalyticsEnabled(value)) toast("Tracking is off, but the setting could not be saved. Check again after restarting.");
  };
  return (
    <Screen>
      <Header back={!split} title="App analytics" />
      <ScrollView contentContainerClassName="pb-16">
        <ReadableWidth>
          <Section description="Help us improve reliability. Off by default and saved only on this device.">
            <Row title="Share app usage and errors" chevron={false} last trailing={<Switch value={enabled} accessibilityLabel="Share app usage and errors" onValueChange={change} />} />
          </Section>
          <Text variant="muted" className="px-4">Shares screen names, app version, operating system and sanitized error locations using an anonymous installation ID. No chat content, credentials, file paths or session recordings. Turning this off discards queued events.</Text>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
