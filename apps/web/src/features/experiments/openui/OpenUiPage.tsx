import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { OpenUIExperiment } from "@/components/(chat)/openui/OpenUIExperiment";
export { getOpenUiMetadata } from "./openUiMetadata";


export default function OpenUiPage() {
  return <OpenUIExperiment />;
}
