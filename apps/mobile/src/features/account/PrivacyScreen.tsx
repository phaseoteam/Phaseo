import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react-native";
import { RefreshControl, ScrollView, Switch, View } from "react-native";
import { confirm, ErrorState, Fact, Header, Icon, LoadingState, ReadableWidth, Row, Screen, Section, Text, toast, toastError } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { updateWorkspacePrivacy, type ChatPrivacyReview, type PrivacyPatch } from "@/lib/api/account";
import { openWeb } from "@/lib/web";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { accountKeys, usePrivacy } from "./queries";

type Policy = ChatPrivacyReview["policy"];
type SwitchKey = keyof PrivacyPatch;

/**
 * The switches of the website's privacy page, in its words. `value` reads the stored setting (missing ones use the
 * website's defaults); `widens` is the direction that shares more, which asks first.
 */
const SWITCHES: { key: SwitchKey; title: string; description: string; value(policy: Policy): boolean; widens: boolean; confirm: string }[] = [
  { key: "privacyEnablePaidMayTrain", title: "Allow paid routes that may train", description: "Use paid providers that may use prompts or answers to train their models.", value: (policy) => policy.privacy_enable_paid_may_train !== false, widens: true, confirm: "Providers on these routes may use this workspace's prompts and answers to train their models." },
  { key: "privacyEnableFreeMayTrain", title: "Allow free routes that may train", description: "Use free providers that may use prompts or answers to train their models.", value: (policy) => policy.privacy_enable_free_may_train !== false, widens: true, confirm: "Free providers on these routes may use this workspace's prompts and answers to train their models." },
  { key: "privacyEnableInputOutputLogging", title: "Allow prompt logging", description: "Use providers that may keep prompts but don't train on them.", value: (policy) => policy.privacy_enable_input_output_logging !== false, widens: true, confirm: "Providers on these routes may keep this workspace's prompts and answers for a time." },
  { key: "privacyZdrOnly", title: "Require zero data retention", description: "Only use routes where the provider keeps nothing once it has answered.", value: (policy) => policy.privacy_zdr_only === true, widens: false, confirm: "Requests may then go to providers that keep data after answering, within the rules above." },
];

const STORAGE = { key: "ioLoggingEnabled" as const, title: "Store request and response payloads", description: "Keep private copies of requests and answers for request details and replay.", confirm: "Phaseo will keep copies of this workspace's requests and answers, including chat, for the retention period." };

const restriction = (mode: string | null | undefined, ids: string[] | null | undefined, noun: string) => {
  const count = ids?.length ?? 0;
  if (mode === "allowlist") return `Only ${count} selected ${noun}${count === 1 ? "" : "s"}`;
  if (mode === "blocklist") return count ? `All except ${count} ${noun}${count === 1 ? "" : "s"}` : `All ${noun}s`;
  return `All ${noun}s`;
};

/** The workspace's privacy settings, as on phaseo.app. Owners and admins can change the switches here. */
export function PrivacyScreen({ workspaceId }: { workspaceId: string }) {
  const { split } = useLayout();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const privacy = usePrivacy(workspaceId);
  const policy = privacy.data?.policy;
  const canEdit = ["owner", "admin"].includes(String(workspace?.role ?? "").toLowerCase());
  const key = accountKeys.privacy(workspaceId);

  const save = useMutation({
    mutationFn: (patch: PrivacyPatch) => updateWorkspacePrivacy(workspaceId, patch),
    // The switch moves at once; it goes back if the save fails.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChatPrivacyReview>(key);
      if (previous) {
        const columns: Record<SwitchKey, keyof Policy> = { privacyEnablePaidMayTrain: "privacy_enable_paid_may_train", privacyEnableFreeMayTrain: "privacy_enable_free_may_train", privacyEnableInputOutputLogging: "privacy_enable_input_output_logging", privacyZdrOnly: "privacy_zdr_only", ioLoggingEnabled: "io_logging_enabled" };
        const next = { ...previous.policy };
        for (const [name, value] of Object.entries(patch)) (next as Record<string, unknown>)[columns[name as SwitchKey]] = value;
        queryClient.setQueryData<ChatPrivacyReview>(key, { ...previous, policy: next });
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toastError("Couldn't save that", error);
    },
    onSuccess: () => toast("Saved. It applies to new requests from this workspace.", { tone: "success" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  /** Sharing more asks first; sharing less saves straight away. */
  const change = async (name: SwitchKey, next: boolean, widens: boolean, title: string, consequence: string) => {
    if (widens) {
      const ok = await confirm({ title: next ? `${title}?` : `Turn off "${title}"?`, body: `${consequence} This applies to every request from ${workspace?.name ?? "this workspace"}, including chat.`, confirmLabel: next ? "Allow" : "Turn off" });
      if (!ok) return;
    }
    save.mutate({ [name]: next });
  };

  return (
    <Screen>
      <Header back={!split} title="Privacy & data" subtitle={workspace?.name} />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={privacy.isRefetching} onRefresh={() => void privacy.refetch()} />}>
        <ReadableWidth>
          {privacy.isLoading ? <LoadingState /> : privacy.isError || !policy ? <ErrorState error={privacy.error} onRetry={() => void privacy.refetch()} /> : (
            <>
              <Text variant="muted" className="px-4">{`These apply to everything ${workspace?.name ?? "this workspace"} sends through Phaseo, including chat.${canEdit ? "" : " Only owners and admins can change them."}`}</Text>
              <Section title="Provider data use">
                {SWITCHES.map((entry, index) => {
                  const value = entry.value(policy);
                  return (
                    <Row
                      key={entry.key}
                      title={entry.title}
                      subtitle={entry.description}
                      numberOfLines={2}
                      chevron={false}
                      last={index === SWITCHES.length - 1}
                      trailing={<Switch value={value} disabled={!canEdit || save.isPending} accessibilityLabel={entry.title} onValueChange={(next) => void change(entry.key, next, entry.widens === next, entry.title, entry.confirm)} trackColorOnClassName="accent-primary" />}
                    />
                  );
                })}
              </Section>
              <Section title="Phaseo log storage">
                <Row
                  title={STORAGE.title}
                  subtitle={`${STORAGE.description}${policy.io_logging_enabled ? ` Kept for ${policy.io_logging_retention_days ?? 90} days.` : ""}`}
                  numberOfLines={2}
                  chevron={false}
                  last
                  trailing={<Switch value={policy.io_logging_enabled === true} disabled={!canEdit || save.isPending} accessibilityLabel={STORAGE.title} onValueChange={(next) => void change(STORAGE.key, next, next, STORAGE.title, STORAGE.confirm)} trackColorOnClassName="accent-primary" />}
                />
              </Section>
              <Section title="Route access" description="Which providers and models this workspace may use.">
                <Fact label="Providers" value={restriction(policy.provider_restriction_mode, policy.provider_restriction_provider_ids, "provider")} />
                <Fact label="Models" value={restriction(policy.model_restriction_mode, policy.model_restriction_model_ids, "model")} />
                <Fact label="Free providers publishing prompts" value={policy.privacy_enable_free_may_publish_prompts ? "Allowed" : "Not allowed"} />
                <Row title={canEdit ? "Choose providers and models on phaseo.app" : "See route access on phaseo.app"} chevron={false} trailing={<Icon icon={ExternalLink} tone="muted" size={15} />} onPress={() => void openWeb("/settings/privacy")} last />
              </Section>
              <Section title="Data contribution">
                <Row title="Data contribution settings" subtitle="Opt in to a discount on requests in return for Phaseo keeping redacted copies for up to 30 days." numberOfLines={2} chevron={false} trailing={<Icon icon={ExternalLink} tone="muted" size={15} />} onPress={() => void openWeb("/settings/privacy")} last />
              </Section>
              <View className="px-4 pt-4">
                <Text variant="caption">Retention, provider payload storage and route lists are changed on phaseo.app.</Text>
              </View>
            </>
          )}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
