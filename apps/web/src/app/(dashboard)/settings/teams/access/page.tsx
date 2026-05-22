import { redirect } from "next/navigation";

export const metadata = {
	title: "Team Access - Settings",
};

export default function TeamAccessPage() {
	redirect("/settings/workspaces/access");
}
