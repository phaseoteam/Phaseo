import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import ToolsGrid from "@/components/(tools)/ToolsGrid";

export const metadata: Metadata = buildMetadata({
	title: "Developer tools - Utilities for AI & LLM workflows",
	description:
		"Browse free developer tools from Phaseo for working with AI models and APIs, including token counting, request building, JSON formatting and more.",
	path: "/tools",
	keywords: [
		"AI tools",
		"developer tools",
		"LLM tools",
		"token counter",
		"request builder",
		"JSON formatter",
		"Phaseo",
	],
});

export default function ToolsPage() {
	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-3xl font-bold mb-2">Developer Tools</h1>
					<p className="text-muted-foreground">
						Useful tools for AI developers, researchers, and
						enthusiasts.
					</p>
				</div>
				<ToolsGrid />
			</div>
		</main>
	);
}
