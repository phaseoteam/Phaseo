import { KeysScreen } from "@/features/account/KeysScreen";
import { SignedInOnly } from "@/features/account/SignedInOnly";

export default function KeysRoute() {
  return <SignedInOnly title="API keys">{(workspaceId) => <KeysScreen key={workspaceId} workspaceId={workspaceId} />}</SignedInOnly>;
}
