import { SignedInOnly } from "@/features/account/SignedInOnly";
import { UsageScreen } from "@/features/account/UsageScreen";

export default function UsageRoute() {
  return <SignedInOnly title="Usage">{(workspaceId) => <UsageScreen key={workspaceId} workspaceId={workspaceId} />}</SignedInOnly>;
}
