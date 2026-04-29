import { redirect } from "next/navigation";

export const metadata = {
	title: "Teams - Settings",
};

export default function TeamsPage() {
	redirect("/settings/workspaces/general");
}
