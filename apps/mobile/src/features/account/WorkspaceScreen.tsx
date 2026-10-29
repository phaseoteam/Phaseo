import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { RefreshControl, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, ErrorState, Header, LoadingState, ReadableWidth, Row, Screen, Section, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { formatNumber } from "@/lib/format";
import { openWeb } from "@/lib/web";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { useTeam } from "./queries";

const roleLabel = (role?: string | null) => (role ? role.replace(/^\w/, (letter) => letter.toUpperCase()) : "Member");
const ROLE_ORDER = ["owner", "admin", "member", "viewer"];

/** The workspace and its members, as the website's Members page lists them. Inviting and roles stay on phaseo.app. */
export function WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const { workspace, workspaces } = useWorkspace();
  const team = useTeam(workspaceId);
  const members = [...(team.data?.members ?? [])].sort((a, b) => {
    const rank = (role?: string | null) => { const index = ROLE_ORDER.indexOf(String(role ?? "").toLowerCase()); return index === -1 ? ROLE_ORDER.length : index; };
    return rank(a.role) - rank(b.role) || (a.display_name ?? "").localeCompare(b.display_name ?? "");
  });

  return (
    <Screen>
      <Header back={!split} title="Members" subtitle={workspace?.name} />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={team.isRefetching} onRefresh={() => void team.refetch()} />}>
        <ReadableWidth>
          <Section className="mt-2">
            <Row
              leading={team.data?.logoUrl ? <Image source={{ uri: team.data.logoUrl }} style={{ width: 32, height: 32, borderRadius: 8 }} contentFit="cover" /> : <Logo label={workspace?.name ?? "W"} size={32} />}
              title={workspace?.name ?? "Workspace"}
              subtitle={`Your role: ${roleLabel(workspace?.role)}`}
              chevron={false}
              trailing={workspaces.length > 1 ? <Button label="Switch" variant="outline" size="sm" onPress={() => router.push("/sheets/workspace")} /> : null}
              last
            />
          </Section>
          <Section title={team.data ? `Members · ${formatNumber(members.length)}` : "Members"} description={team.data?.pendingInvites ? `${team.data.pendingInvites} ${team.data.pendingInvites === 1 ? "invite is" : "invites are"} waiting to be accepted.` : undefined}>
            {team.isLoading ? <LoadingState /> : team.isError ? <ErrorState error={team.error} onRetry={() => void team.refetch()} /> : members.length === 0 ? <Text variant="muted" className="px-4 py-3">Only you.</Text> : members.map((member, index) => {
              const name = member.display_name?.trim() || "Member";
              const you = member.user_id === team.data?.currentUserId;
              return (
                <Row
                  key={member.user_id}
                  leading={<Logo label={name} size={32} />}
                  title={you ? `${name} (you)` : name}
                  value={roleLabel(member.role)}
                  last={index === members.length - 1}
                />
              );
            })}
          </Section>
          <View className="px-4 pt-6">
            <Button label={team.data?.canManage ? "Invite or manage members on phaseo.app" : "See members on phaseo.app"} icon={ExternalLink} variant="outline" onPress={() => void openWeb("/settings/teams/members")} />
          </View>
          <Text variant="caption" className="px-4 pt-2">Invites, roles and removing members are on phaseo.app.</Text>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}

