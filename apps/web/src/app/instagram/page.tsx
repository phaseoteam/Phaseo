import { redirect } from "next/navigation";
import { withUTM } from "@/lib/utm";

export default function RedirectPage() {
	redirect(
		withUTM("https://instagram.com/ai__stats", {
			campaign: "shortlink",
			content: "instagram",
		})
	);
}
