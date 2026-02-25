import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "AI Updates - Latest AI Model, Web & YouTube Changes",
	description:
		"Stay up to date with the latest in AI. See new model launches, deprecations, research drops, data hubs, and YouTube explainers aggregated by AI Stats from across the ecosystem.",
	path: "/updates",
	keywords: [
		"AI updates",
		"AI news",
		"new AI models",
		"AI changelog",
		"model launches",
		"AI research updates",
		"YouTube AI releases",
		"AI Stats",
	],
});

export default function Page() {
	redirect("/updates/models");
}
