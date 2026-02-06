import { redirect } from "next/navigation";
import { withUTM } from "@/lib/utm";

export default function RedirectPage() {
	redirect(
		withUTM("https://x.com/ai_stats_team", {
			campaign: "shortlink",
			content: "twitter",
		})
	);
}
