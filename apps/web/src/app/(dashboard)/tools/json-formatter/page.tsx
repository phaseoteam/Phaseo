import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import JsonFormatter from "@/components/(tools)/JsonFormatter";

export const metadata: Metadata = buildMetadata({
	title: "JSON formatter - Validate & Prettify JSON Payloads",
	description:
		"Format, validate, and beautify JSON data used in AI requests and responses. Quickly spot syntax errors and clean up payloads before sending them to APIs.",
	path: "/tools/json-formatter",
	keywords: [
		"JSON formatter",
		"JSON validator",
		"prettify JSON",
		"API payloads",
		"AI responses",
		"Phaseo tools",
	],
});

export default function JsonFormatterPage() {
	return <JsonFormatter />;
}
