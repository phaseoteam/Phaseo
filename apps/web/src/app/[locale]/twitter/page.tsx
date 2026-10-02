import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://x.com/phaseoteam");
}
