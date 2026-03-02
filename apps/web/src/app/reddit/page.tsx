import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Reddit redirect",
	description: "Redirect route to the official AI Stats subreddit.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://reddit.com/r/AIStats/");
}
