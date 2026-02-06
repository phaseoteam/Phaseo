import { redirect } from "next/navigation";
import { withUTM } from "@/lib/utm";

export default function RedirectPage() {
	redirect(
		withUTM("https://reddit.com/r/AIStats/", {
			campaign: "shortlink",
			content: "reddit",
		})
	);
}
