import { redirect } from "next/navigation";

export const metadata = {
	title: "Workspace Settings - Settings",
};

export default function WorkspaceSettingsPage() {
	redirect("/settings/workspaces/general");
}
