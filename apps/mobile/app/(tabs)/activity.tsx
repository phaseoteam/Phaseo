import { CircleCheck, CircleX, Filter } from "lucide-react-native";
import { ScrollView } from "react-native";
import { EmptyState, PageIntro, Row, Screen, Section } from "@/components/ui";
import { useAuth } from "@/providers/AppProviders";

export default function ActivityScreen() {
  const { session } = useAuth();
  return <Screen><ScrollView contentContainerStyle={{ paddingBottom: 48 }}>{session ? <><PageIntro eyebrow="Observability" title="Activity" body="Inspect requests, latency, routing and cost across your workspace." /><Section title="Filters"><Row icon={Filter} title="All requests" subtitle="Filter by status, latency, model, provider or request ID" /></Section><Section title="Recent requests"><EmptyState title="Select a workspace" body="Request data is private and will appear after workspace selection." /></Section></> : <><PageIntro eyebrow="Observability" title="Activity" body="Request IDs, cost, routing and logs are private workspace data." /><EmptyState title="Sign in to inspect activity" body="Connect your workspace to see recent gateway requests." /></>}</ScrollView></Screen>;
}

export const activityStatusIcon = (success: boolean) => success ? CircleCheck : CircleX;
