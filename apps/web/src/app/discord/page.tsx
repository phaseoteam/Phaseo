import { redirect } from "next/navigation";
import { withUTM } from "@/lib/utm";

export default function RedirectPage() {
	redirect(
		withUTM("https://discord.gg/zDw73wamdX", {
			campaign: "shortlink",
			content: "discord",
		})
	);
}
