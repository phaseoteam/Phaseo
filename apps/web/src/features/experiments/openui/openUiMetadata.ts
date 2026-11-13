import type { PageMetadata } from "@/lib/seo/metadataTypes";

export function getOpenUiMetadata(): PageMetadata {
  return {
    title: "OpenUI experiment",
    robots: { index: false, follow: false },
  };
}
