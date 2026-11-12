import { CreditsScreen } from "@/features/account/CreditsScreen";
import { SignedInOnly } from "@/features/account/SignedInOnly";

export default function CreditsRoute() {
  return <SignedInOnly title="Credits & billing">{(workspaceId) => <CreditsScreen key={workspaceId} workspaceId={workspaceId} />}</SignedInOnly>;
}
