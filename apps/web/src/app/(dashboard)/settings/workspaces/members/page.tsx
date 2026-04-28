import { redirect } from "next/navigation";

export const metadata = {
	title: "Workspace Members - Settings",
};

export default function WorkspaceMembersPage() {
	redirect("/settings/workspaces/general");
}
