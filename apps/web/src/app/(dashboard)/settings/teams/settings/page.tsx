import { redirect } from "next/navigation";

export const metadata = {
	title: "Team Settings - Settings",
};

export default function TeamSettingsPage() {
	redirect("/settings/workspaces/general");
}

