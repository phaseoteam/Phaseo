import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { RefreshControl, ScrollView, View } from "react-native";
import { Button, Fact, Header, LoadingState, ReadableWidth, Row, Screen, Section, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { getBalance, getMembers } from "@/lib/api/account";
import { WEB_ORIGIN } from "@/lib/config";
import { formatUsd } from "@/lib/format";
import { useWorkspace } from "@/providers/WorkspaceProvider";

const roleLabel = (role?: string | null) => (role ? role.replace(/^\w/, (letter) => letter.toUpperCase()) : "Member");

export function WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const { workspace, workspaces } = useWorkspace();
  const balance = useQuery({ queryKey: ["account", workspaceId, "balance"], queryFn: () => getBalance(workspaceId) });
  const members = useQuery({ queryKey: ["account", workspaceId, "members"], queryFn: () => getMembers(workspaceId) });

  return (
    <Screen>
      <Header back={!split} title="Workspace" />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={balance.isRefetching} onRefresh={() => { void balance.refetch(); void members.refetch(); }} />}>
        <ReadableWidth>
          <Section title={workspace?.name ?? "Workspace"} className="mt-2">
            <Fact label="Your role" value={roleLabel(workspace?.role)} />
            <Fact label="Credit balance" value={balance.isLoading ? "…" : formatUsd(balance.data)} last />
            <View className="flex-row gap-2 px-4 pt-3">
              {workspaces.length > 1 ? <Button label="Switch workspace" variant="outline" size="sm" onPress={() => router.push("/sheets/workspace")} /> : null}
              <Button label="Top up on phaseo.app" icon={ExternalLink} variant="outline" size="sm" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/settings/credits`)} />
            </View>
          </Section>
          <Section title="Members" description="Invite and manage members on phaseo.app.">
            {members.isLoading ? <LoadingState /> : (members.data ?? []).length === 0 ? <Text variant="muted" className="px-4 py-3">Only you.</Text> : (members.data ?? []).map((member, index, list) => (
              <Row key={member.user_id} title={member.display_name ?? "Member"} value={roleLabel(member.role)} last={index === list.length - 1} />
            ))}
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
