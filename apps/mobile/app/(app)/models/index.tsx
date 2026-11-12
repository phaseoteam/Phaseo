import { ScrollView } from "react-native";
import { Header, ReadableWidth, Screen } from "@/components/ui";
import { ModelBrowser } from "@/features/models/ModelBrowser";
import { ModelsSummary } from "@/features/models/ModelsSummary";
import { useLayout } from "@/hooks/useLayout";

export default function ModelsIndex() {
  const { split } = useLayout();
  if (!split) return <ModelBrowser />;
  // Split layouts keep the catalogue in the list pane, so the summary fills the detail pane until a model is chosen.
  return (
    <Screen>
      <Header large title="Latest" />
      <ScrollView contentContainerClassName="pb-16">
        <ReadableWidth><ModelsSummary /></ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
