import { SignedInOnly } from "@/features/account/SignedInOnly";
import { WorkspaceScreen } from "@/features/account/WorkspaceScreen";

export default function MembersRoute() {
  return <SignedInOnly title="Members">{(workspaceId) => <WorkspaceScreen key={workspaceId} workspaceId={workspaceId} />}</SignedInOnly>;
}
