import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Collections redirect",
	description:
		"Legacy collections route that permanently redirects to the AI Stats model collections directory.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function CollectionsPage() {
	permanentRedirect("/models/collections");
}
