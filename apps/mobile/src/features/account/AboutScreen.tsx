import * as Linking from "expo-linking";
import { ScrollView } from "react-native";
import { Fact, Header, ReadableWidth, Row, Screen, Section } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { APP_VERSION, WEB_ORIGIN } from "@/lib/config";

const LINKS = [
  { title: "Documentation", url: "https://docs.phaseo.app" },
  { title: "Status", url: `${WEB_ORIGIN}/status` },
  { title: "Privacy policy", url: `${WEB_ORIGIN}/privacy` },
  { title: "Terms", url: `${WEB_ORIGIN}/terms` },
];

export function AboutScreen() {
  const { split } = useLayout();
  return (
    <Screen>
      <Header back={!split} title="About" />
      <ScrollView>
        <ReadableWidth>
          <Section className="mt-2">
            <Fact label="Version" value={APP_VERSION} />
            <Fact label="Chats" value="Stored only on this device" last />
          </Section>
          <Section title="Links">
            {LINKS.map((link, index) => <Row key={link.url} title={link.title} onPress={() => void Linking.openURL(link.url)} last={index === LINKS.length - 1} />)}
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
