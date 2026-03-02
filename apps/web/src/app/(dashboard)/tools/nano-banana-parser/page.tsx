import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import NanoBananaParser from "@/components/(tools)/NanoBananaParser";

export const metadata: Metadata = buildMetadata({
	title: "Nano Banana parser - Parse Raw Candidates Payloads",
	description:
		"Paste raw Nano Banana responses and parse candidates, text parts, inline data payloads, and usage metadata in one place for faster debugging and validation.",
	path: "/tools/nano-banana-parser",
	keywords: [
		"Nano Banana parser",
		"Gemini candidates parser",
		"AI response parser",
		"JSON candidates",
		"AI Stats tools",
	],
});

export default function NanoBananaParserPage() {
	return <NanoBananaParser />;
}
