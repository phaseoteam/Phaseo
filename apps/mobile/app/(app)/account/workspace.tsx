import { SignedInOnly } from "@/features/account/SignedInOnly";
import { WorkspaceScreen } from "@/features/account/WorkspaceScreen";

export default function WorkspaceRoute() {
  return <SignedInOnly title="Workspace">{(workspaceId) => <WorkspaceScreen key={workspaceId} workspaceId={workspaceId} />}</SignedInOnly>;
}
