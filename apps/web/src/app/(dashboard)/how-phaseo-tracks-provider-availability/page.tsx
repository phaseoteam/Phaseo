import type { Metadata } from "next";
import { MethodologyArticlePage } from "@/components/methodology/MethodologyArticlePage";
import {
	METHODOLOGY_ENTRY_BY_SLUG,
	type MethodologyEntry,
} from "@/lib/content/methodology";
import { buildMetadata } from "@/lib/seo";

const entry = METHODOLOGY_ENTRY_BY_SLUG[
	"how-phaseo-tracks-provider-availability"
] as MethodologyEntry;

export const metadata: Metadata = buildMetadata({
	title: entry.title,
	description: entry.description,
	path: entry.path,
	keywords: entry.keywords,
});

export default function ProviderAvailabilityMethodologyPage() {
	return <MethodologyArticlePage entry={entry} />;
}
