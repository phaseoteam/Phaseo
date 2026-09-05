import { redirect } from "next/navigation";

export const metadata = { title: "Provider - Workspace Settings" };

export default function ProviderOnboardingPage() {
	redirect("/settings/workspaces/provider");
}
