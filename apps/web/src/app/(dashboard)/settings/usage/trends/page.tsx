import type { Metadata } from "next";

import { ObservabilityPageContent } from "../page";

export const metadata: Metadata = {
	title: "Observability Trends - Settings",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default function Page(props: { searchParams: Promise<SearchParams> }) {
	return (
		<ObservabilityPageContent
			searchParams={props.searchParams}
			initialTab="trends"
		/>
	);
}
