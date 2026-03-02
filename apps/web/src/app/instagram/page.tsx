import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Instagram redirect",
	description: "Redirect route to the official AI Stats Instagram account.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://instagram.com/ai__stats");
}
