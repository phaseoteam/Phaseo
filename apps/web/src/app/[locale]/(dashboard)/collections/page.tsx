import type { Metadata } from "@/lib/seo/metadataTypes";
import { permanentRedirect } from "@/lib/navigation";

export const metadata: Metadata = {
	robots: {
		index: false,
		follow: false,
	},
};

export default function CollectionsPage() {
	permanentRedirect("/models");
}
