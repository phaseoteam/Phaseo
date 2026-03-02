import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import MarkdownPreviewer from "@/components/(tools)/MarkdownPreviewer";

export const metadata: Metadata = buildMetadata({
	title: "Markdown Previewer - Live Preview For Prompts & Docs",
	description:
		"Write and preview Markdown in real time for prompts, system messages, and documentation, with a fast editing flow that helps teams format AI workflow content reliably.",
	path: "/tools/markdown-preview",
	keywords: [
		"Markdown preview",
		"Markdown editor",
		"prompt formatting",
		"system prompts",
		"AI documentation",
		"AI Stats tools",
	],
});

export default function MarkdownPreviewPage() {
	return <MarkdownPreviewer />;
}
