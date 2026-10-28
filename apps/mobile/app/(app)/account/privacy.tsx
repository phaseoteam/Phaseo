import { PrivacyScreen } from "@/features/account/PrivacyScreen";
import { SignedInOnly } from "@/features/account/SignedInOnly";

export default function PrivacyRoute() {
  return <SignedInOnly title="Privacy & data">{(workspaceId) => <PrivacyScreen key={workspaceId} workspaceId={workspaceId} />}</SignedInOnly>;
}
