import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { OpenUIExperiment } from "@/components/(chat)/openui/OpenUIExperiment";

export function getOpenUiMetadata(): PageMetadata {
  return {
    title: "OpenUI experiment",
    robots: { index: false, follow: false },
  };
}

export default function OpenUiPage() {
  return <OpenUIExperiment />;
}
