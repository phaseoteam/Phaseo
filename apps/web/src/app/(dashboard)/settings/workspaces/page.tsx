import { redirect } from "next/navigation";

export const metadata = {
	title: "Workspaces - Settings",
};

export default function WorkspacesPage() {
	redirect("/settings/workspaces/general");
}
