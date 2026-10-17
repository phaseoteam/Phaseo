import { SplitStack } from "@/components/shell/SplitStack";
import { ProviderBrowser } from "@/features/providers/ProviderBrowser";

export const unstable_settings = { anchor: "index" };

export default function ProvidersLayout() {
  return <SplitStack list={<ProviderBrowser />} />;
}
