import { redirect } from "next/navigation";

export default function WorkspacesPage() {
	redirect("/settings/workspaces/members");
}
