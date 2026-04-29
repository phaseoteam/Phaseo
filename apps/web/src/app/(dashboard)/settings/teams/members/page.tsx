import { redirect } from "next/navigation";

export const metadata = {
	title: "Team Members - Settings",
};

export default function TeamMembersPage() {
	redirect("/settings/workspaces/general");
}

