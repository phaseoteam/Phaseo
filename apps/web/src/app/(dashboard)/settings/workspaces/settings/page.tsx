import { enterpriseSelfServePreviewEnabled } from "@/lib/flags";
import { connection } from "next/server";
import WorkspaceSettingsContent from "./WorkspaceSettingsContent";
export const metadata = { title: "Workspace Settings - Settings" };
export default async function Page() {
	await connection();
	return <WorkspaceSettingsContent canConfigureEnterprise={await enterpriseSelfServePreviewEnabled()} />;
}
