import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
	title: "Video Studio - AI Stats Chat",
	description: "Prompt-first video generation workspace with async polling.",
	path: "/chat/video",
	keywords: ["AI video generation", "video studio", "AI Stats chat"],
});

export default async function ChatVideoPage() {
	redirect("/chat");
}
