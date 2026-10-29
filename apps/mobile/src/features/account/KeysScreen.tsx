import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { KeyRound } from "lucide-react-native";
import { RefreshControl, ScrollView } from "react-native";
import { Button, confirm, EmptyState, ErrorState, Header, LoadingState, ReadableWidth, Row, Screen, Text, toast, toastError } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { getKeys, revokeKey, type GatewayKey } from "@/lib/api/account";
import { WEB_ORIGIN } from "@/lib/config";
import { formatCalendarDate } from "@/lib/format";

export function KeysScreen({ workspaceId }: { workspaceId: string }) {
  const { split } = useLayout();
  const queryClient = useQueryClient();
  const keys = useQuery({ queryKey: ["account", workspaceId, "keys"], queryFn: () => getKeys(workspaceId) });
  const revoke = useMutation({
    mutationFn: (key: GatewayKey) => revokeKey(workspaceId, key.id),
    onSuccess: (_, key) => {
      toast(`${key.name ?? "The key"} was revoked.`, { tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["account", workspaceId, "keys"] });
    },
    onError: (error) => toastError("Couldn't revoke the key", error),
  });

  const askToRevoke = async (key: GatewayKey) => {
    const ok = await confirm({ title: `Revoke ${key.name ?? "this key"}?`, body: "Apps using it stop working straight away. This can't be undone.", confirmLabel: "Revoke", destructive: true });
    if (ok) revoke.mutate(key);
  };

  return (
    <Screen>
      <Header back={!split} title="API keys" right={<Button label="New key" variant="ghost" size="sm" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/settings/keys`)} />} />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={keys.isRefetching} onRefresh={() => void keys.refetch()} />}>
        <ReadableWidth>
          {keys.isLoading ? <LoadingState /> : keys.isError ? <ErrorState error={keys.error} onRetry={() => void keys.refetch()} /> : !keys.data?.length ? (
            <EmptyState icon={KeyRound} title="No API keys" body="Create keys on phaseo.app. The secret is shown once, so it never passes through this app." />
          ) : (
            <>
              <Text variant="muted" className="px-4 pb-2">Tap a key to revoke it. New keys are created on phaseo.app so the secret stays off your phone.</Text>
              {keys.data.map((key, index) => (
                <Row
                  key={key.id}
                  icon={KeyRound}
                  title={key.name ?? "Unnamed key"}
                  subtitle={[key.prefix ? `${key.prefix}…` : null, key.last_used_at ? `Used ${formatCalendarDate(key.last_used_at)}` : "Never used", key.status && key.status !== "active" ? key.status : null].filter(Boolean).join(" · ")}
                  onPress={() => void askToRevoke(key)}
                  chevron={false}
                  last={index === keys.data.length - 1}
                />
              ))}
            </>
          )}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
