import * as React from "react";
import Hero from "@/components/wrapped/hero";
import { HelpSection } from "@/components/wrapped/help-section";
import WrappedClient from "@/components/wrapped/wrapped-client";

export const metadata = {
	title: "AI Stats Wrapped - Relive Your Year in AI",
	description:
		"Upload exports from your favorite AI copilots and transform them into a Spotify Wrapped-style story. Everything runs in your browser -- your data never leaves the page.",
	openGraph: {
		title: "AI Stats Wrapped - Relive Your Year in AI",
		description:
			"Discover your AI conversation stats with a fun, shareable Wrapped experience.",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "AI Stats Wrapped - Relive Your Year in AI",
		description:
			"Discover your AI conversation stats with a fun, shareable Wrapped experience.",
	},
};

export default function WrappedPage() {
	return (
		<div className="container mx-auto mt-4 mb-12 space-y-12">
			<Hero />

			<WrappedClient />

			<HelpSection />
		</div>
	);
}
