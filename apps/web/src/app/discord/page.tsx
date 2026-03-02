import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Discord redirect",
	description: "Redirect route to the official AI Stats Discord community.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function RedirectPage() {
	redirect("https://discord.gg/zDw73wamdX");
}
