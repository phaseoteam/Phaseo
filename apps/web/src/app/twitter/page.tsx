import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Twitter redirect",
	description:
		"Legacy Twitter route that redirects to the official Phaseo X account.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://x.com/phaseoteam");
}
