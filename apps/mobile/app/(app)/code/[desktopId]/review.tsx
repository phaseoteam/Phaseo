import { useLocalSearchParams } from "expo-router";
import type { PhoneDiffScope } from "@/features/desktops/protocol";
import { ReviewScreen } from "@/features/desktops/review/ReviewScreen";

const scopes: readonly PhoneDiffScope[] = ["uncommitted", "branch", "turn"];

export default function DesktopReviewRoute() {
  const { desktopId, chatId, scope, messageId } = useLocalSearchParams<{ desktopId: string; chatId: string; scope?: string; messageId?: string }>();
  const picked = scopes.find((value) => value === scope) ?? "uncommitted";
  return <ReviewScreen key={`${desktopId}:${chatId}:${messageId ?? ""}`} desktopId={desktopId} chatId={chatId} scope={picked} messageId={messageId ?? null} />;
}
