import { Check } from "lucide-react-native";
import { ScrollView } from "react-native";
import { Header, Icon, ReadableWidth, Row, Screen, Section } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { useAppearance, type ThemePreference } from "@/providers/AppearanceProvider";

const OPTIONS: { value: ThemePreference; title: string; subtitle?: string }[] = [
  { value: "system", title: "Match system", subtitle: "Follows your phone's light or dark setting" },
  { value: "light", title: "Light" },
  { value: "dark", title: "Dark" },
];

export function AppearanceScreen() {
  const { split } = useLayout();
  const { preference, setPreference } = useAppearance();
  return (
    <Screen>
      <Header back={!split} title="Appearance" />
      <ScrollView>
        <ReadableWidth>
          <Section title="Theme" className="mt-2">
            {OPTIONS.map((option, index) => (
              <Row key={option.value} title={option.title} subtitle={option.subtitle} chevron={false} trailing={preference === option.value ? <Icon icon={Check} tone="primary" size={18} /> : null} onPress={() => setPreference(option.value)} last={index === OPTIONS.length - 1} />
            ))}
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
