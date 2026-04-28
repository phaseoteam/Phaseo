import { redirect } from "next/navigation";

export const metadata = {
	title: "Settings",
};

export default function SettingsIndexPage() {
	// Redirect to credits by default
	redirect("/settings/credits");
}
