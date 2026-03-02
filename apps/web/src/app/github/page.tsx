import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "GitHub redirect",
	description: "Redirect route to the official AI Stats GitHub repository.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://github.com/AI-Stats/AI-Stats");
}
