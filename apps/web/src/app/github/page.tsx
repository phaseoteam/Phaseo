import { redirect } from "next/navigation";
import { withUTM } from "@/lib/utm";

export default function RedirectPage() {
	redirect(
		withUTM("https://github.com/AI-Stats/AI-Stats", {
			campaign: "shortlink",
			content: "github",
		})
	);
}
