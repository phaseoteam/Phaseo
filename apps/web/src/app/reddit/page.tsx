import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Community redirect",
	description: "Redirect route to the official Phaseo subreddit.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://www.reddit.com/r/Phaseo/");
}
