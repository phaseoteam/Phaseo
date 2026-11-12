import { Server } from "lucide-react-native";
import { DetailPlaceholder } from "@/components/shell/SplitStack";
import { ProviderBrowser } from "@/features/providers/ProviderBrowser";
import { useLayout } from "@/hooks/useLayout";

export default function ProvidersIndex() {
  const { split } = useLayout();
  if (split) return <DetailPlaceholder icon={Server} title="Choose a provider" body="Uptime, privacy terms and the models each provider serves appear here." />;
  return <ProviderBrowser />;
}
