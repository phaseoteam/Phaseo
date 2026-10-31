import type { Metadata } from "@/lib/seo/metadataTypes";
import { redirect } from "@/lib/navigation";

export const metadata: Metadata = {
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://www.reddit.com/r/Phaseo/");
}
