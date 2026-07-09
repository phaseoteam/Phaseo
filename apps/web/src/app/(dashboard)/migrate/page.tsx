import { Metadata } from "next";
import Image from "next/image";
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
			<div className="flex flex-col gap-5 rounded-3xl border border-border/70 bg-background p-6 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold">Migration Assistant</h1>
					<p className="max-w-2xl text-muted-foreground">
						Pick your current setup and get a tailored migration guide.
					</p>
				</div>
				<div className="flex h-14 w-fit items-center rounded-2xl border border-border/70 bg-muted/30 px-4">
					<Image
						src="/wordmark_light.svg"
						alt="Phaseo"
						width={142}
						height={36}
						className="h-8 w-auto dark:hidden"
						priority
					/>
					<Image
						src="/wordmark_dark.svg"
						alt="Phaseo"
						width={142}
						height={36}
						className="hidden h-8 w-auto dark:block"
						priority
					/>
				</div>
			</div>
			<MigrationGuide />
		</div>
	);
}
