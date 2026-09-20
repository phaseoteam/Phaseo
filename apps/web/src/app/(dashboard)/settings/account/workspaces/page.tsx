import { redirect } from "next/navigation";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import WorkspacesContent from "./WorkspacesContent";
export const metadata = { title: "Workspaces - Account Settings" };
export default async function Page() {
	if ((await fetchInternalAuthHeaderData()).providerMode) redirect("/settings/account/providers");
	return <WorkspacesContent />;
}
