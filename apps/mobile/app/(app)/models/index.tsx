import { Bot } from "lucide-react-native";
import { DetailPlaceholder } from "@/components/shell/SplitStack";
import { ModelBrowser } from "@/features/models/ModelBrowser";
import { useLayout } from "@/hooks/useLayout";

export default function ModelsIndex() {
  const { split } = useLayout();
  if (split) return <DetailPlaceholder icon={Bot} title="Choose a model" body="Pricing, providers, benchmarks and usage appear here. Long-press models to compare them." />;
  return <ModelBrowser />;
}
