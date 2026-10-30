"use client";

import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsResourceData } from "@/app/(dashboard)/settings/cachedSettingsActions";
import { PrivateModelsManager } from "./PrivateModelsManager";

export default withSettingsResource("private-models", function PrivateModelsContent({ initialData: data }: { initialData: SettingsResourceData<"private-models"> }) {
	return <PrivateModelsManager initialModels={data.models} canManage={data.canManage} hasWorkspace={Boolean(data.workspaceId)} />;
});
