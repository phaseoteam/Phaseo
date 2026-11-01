import { SquareTerminal } from "lucide-react-native";
import { DetailPlaceholder } from "@/components/shell/SplitStack";
import { CodeScreen } from "@/features/desktops/CodeScreen";
import { useLayout } from "@/hooks/useLayout";

export default function CodeIndex() {
  const { split } = useLayout();
  if (split) return <DetailPlaceholder icon={SquareTerminal} title="Choose a thread" body="A thread's messages, approvals and questions appear here, with a box to steer or stop it." />;
  return <CodeScreen />;
}
