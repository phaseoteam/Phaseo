import { Metadata } from "next";
import { MigrationGuide } from "@/components/(migrate)/MigrationGuide";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "Migrate to Phaseo Gateway",
	description:
		"Interactive migration guide to move from OpenRouter, Vercel AI Gateway, Requesty, LLMGateway, and OpenAI-compatible libraries to Phaseo Gateway.",
	path: "/migrate",
	keywords: [
		"AI gateway migration",
		"migrate to Phaseo",
		"OpenRouter migration guide",
		"Vercel AI Gateway migration",
		"Requesty migration",
		"LLMGateway migration",
	],
});

export default function MigratePage() {
	return (
		<div className="container mx-auto py-10 space-y-10">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold">Migration Assistant</h1>
				<p className="text-muted-foreground">
					Pick your current setup and get a tailored migration guide.
				</p>
			</div>
			<MigrationGuide />
		</div>
	);
}
