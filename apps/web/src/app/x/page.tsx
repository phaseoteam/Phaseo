import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "X redirect",
	description: "Redirect route to the official Phaseo X account.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://x.com/phaseoteam");
}
