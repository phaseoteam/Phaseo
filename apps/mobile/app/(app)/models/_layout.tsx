import { SplitStack } from "@/components/shell/SplitStack";
import { ModelBrowser } from "@/features/models/ModelBrowser";

export const unstable_settings = { anchor: "index" };

export default function ModelsLayout() {
  return <SplitStack list={<ModelBrowser />} />;
}
