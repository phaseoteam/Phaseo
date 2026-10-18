import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, EmptyState, ErrorState, Fact, Header, Icon, LoadingState, Row, RouteSheet, SearchField, Section, Text, TextField } from "@/components/ui";
import { getChat, listMessages, updateChat } from "@/features/chat/db";
import { editAndResend } from "@/features/chat/runner";
import { chatModelStore, MAX_CHAT_MODELS, notifyChat, toggleChatModel } from "@/features/chat/state";
import { ModelPicker } from "@/features/models/ModelPicker";
import { draftRuleStore, useRuleNames } from "@/features/notifications/state";
import { useProviders } from "@/features/providers/ProviderBrowser";
import { compareStore, toggleCompare } from "@/features/models/state";
import { acceptChatPrivacyReview, getChatPrivacyReview } from "@/lib/api/account";
import { MAX_COMPARE } from "@/lib/api/compare";
import { useWorkspace } from "@/providers/WorkspaceProvider";

/** Long pickers take the full dialog height on tablets; short forms size to their content. */
const TALL_SHEETS = new Set(["compare", "chat-models", "pick"]);

/** Root-level sheets shared by several sections: bottom sheets on phones, centred dialogs on tablets. */
export default function SheetRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  return (
    <RouteSheet size={TALL_SHEETS.has(kind) ? "tall" : "fit"}>
      {kind === "compare" ? <CompareSheet />
        : kind === "chat-models" ? <ChatModelsSheet />
        : kind === "workspace" ? <WorkspaceSheet />
        : kind === "rename-chat" ? <RenameChatSheet />
        : kind === "edit-message" ? <EditMessageSheet />
        : kind === "privacy" ? <PrivacySheet />
        : kind === "pick" ? <PickSheet />
        : <EmptyState title="Nothing here" />}
    </RouteSheet>
  );
}

function CompareSheet() {
  const router = useRouter();
  const selected = compareStore.use();
  return (
    <View className="flex-1">
      <Header title={`Compare · ${selected.length} of ${MAX_COMPARE}`} right={<Button label="Done" size="sm" variant="ghost" onPress={() => router.back()} />} />
      <ModelPicker selected={selected} onSelect={(model) => toggleCompare(model.model_id)} />
    </View>
  );
}

/** Models for a new chat, or for an existing chat's next messages when `chatId` is set. */
function ChatModelsSheet() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const draft = chatModelStore.use();
  const [chatModels, setChatModels] = useState<string[]>(() => (chatId ? getChat(chatId)?.models ?? [] : []));
  const selected = chatId ? chatModels : draft;
  const toggle = (id: string) => {
    if (!chatId) return toggleChatModel(id);
    const next = selected.includes(id) ? (selected.length > 1 ? selected.filter((entry) => entry !== id) : selected) : selected.length >= MAX_CHAT_MODELS ? selected : [...selected, id];
    setChatModels(next);
    updateChat(chatId, { models: next });
    notifyChat(chatId);
  };
  return (
    <View className="flex-1">
      <Header title={selected.length > 1 ? `${selected.length} models answer side by side` : "Model"} right={<Button label="Done" size="sm" variant="ghost" onPress={() => router.back()} />} />
      <Text variant="caption" className="px-4 pb-2">{chatId ? "Applies to your next message. " : ""}Pick up to {MAX_CHAT_MODELS} models to compare their answers.</Text>
      <ModelPicker onlyChat selected={selected} onSelect={(model) => toggle(model.model_id)} />
    </View>
  );
}

function WorkspaceSheet() {
  const router = useRouter();
  const { workspaces, workspaceId, selectWorkspace } = useWorkspace();
  return (
    <View className="pb-2">
      <Header title="Workspace" />
      {workspaces.map((workspace, index) => (
        <Row
          key={workspace.id}
          title={workspace.name ?? workspace.id}
          subtitle={workspace.role ? workspace.role.replace(/^\w/, (letter) => letter.toUpperCase()) : null}
          trailing={workspace.id === workspaceId ? <Icon icon={Check} tone="primary" size={18} /> : null}
          chevron={false}
          onPress={() => { selectWorkspace(workspace.id); router.back(); }}
          last={index === workspaces.length - 1}
        />
      ))}
    </View>
  );
}

function RenameChatSheet() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [title, setTitle] = useState(() => getChat(id)?.title ?? "");
  const save = () => {
    if (!title.trim()) return;
    updateChat(id, { title: title.trim() });
    notifyChat(id);
    router.back();
  };
  return (
    <View className="gap-3 px-4 pb-4 pt-4">
      <Text variant="heading">Rename chat</Text>
      <TextField value={title} onChangeText={setTitle} autoFocus selectTextOnFocus returnKeyType="done" onSubmitEditing={save} />
      <Button label="Save" disabled={!title.trim()} onPress={save} />
    </View>
  );
}

function EditMessageSheet() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const { id, chatId } = useLocalSearchParams<{ id: string; chatId: string }>();
  const message = listMessages(chatId).find((entry) => entry.id === id);
  const [text, setText] = useState(message?.content ?? "");
  if (!message) return <EmptyState title="Message not found" />;
  return (
    <View className="gap-3 px-4 pb-4 pt-4">
      <Text variant="heading">Edit and resend</Text>
      <Text variant="muted">Answers after this message are replaced.</Text>
      <TextField value={text} onChangeText={setText} multiline autoFocus className="max-h-60 min-h-28" textAlignVertical="top" />
      <Button label="Resend" disabled={!text.trim()} onPress={() => { editAndResend(message, text.trim(), workspaceId); router.back(); }} />
    </View>
  );
}

const yes = (value: boolean | null | undefined) => (value ? "Allowed" : "Not allowed");

/** Web chat's one-time privacy confirmation, per workspace. */
function PrivacySheet() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const review = useQuery({ queryKey: ["account", workspaceId, "chat-privacy"], queryFn: () => getChatPrivacyReview(workspaceId) });
  const accept = useMutation({
    mutationFn: () => acceptChatPrivacyReview(review.data!.workspaceId, review.data!.version),
    onSuccess: () => router.back(),
  });
  if (review.isLoading) return <LoadingState />;
  if (review.isError || !review.data) return <ErrorState error={review.error} onRetry={() => void review.refetch()} />;
  const policy = review.data.policy;
  return (
    <ScrollView contentContainerClassName="pb-10">
      <Header title="Before you chat" />
      <Text variant="muted" className="px-4">{`Chat uses ${review.data.workspaceName ?? "your workspace"}'s privacy settings. Check they're what you expect; you can change them on phaseo.app.`}</Text>
      <Section title="Your workspace">
        <Fact label="Providers training on paid prompts" value={yes(policy.privacy_enable_paid_may_train)} />
        <Fact label="Providers training on free prompts" value={yes(policy.privacy_enable_free_may_train)} />
        <Fact label="Free providers publishing prompts" value={yes(policy.privacy_enable_free_may_publish_prompts)} />
        <Fact label="Only zero-data-retention providers" value={policy.privacy_zdr_only ? "Yes" : "No"} />
        <Fact label="Phaseo stores prompts and answers" value={policy.io_logging_enabled ? `Yes${policy.io_logging_retention_days ? `, for ${policy.io_logging_retention_days} days` : ""}` : "No"} last />
      </Section>
      <View className="gap-2 px-4 pt-6">
        <Button label="These are fine, continue" loading={accept.isPending} onPress={() => accept.mutate()} />
        {accept.isError ? <Text variant="small" className="text-destructive">{accept.error instanceof Error ? accept.error.message : "Couldn't save that."}</Text> : null}
      </View>
    </ScrollView>
  );
}

/** Lab, provider or model choices for the notification rule being edited. */
function PickSheet() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: "labs" | "providers" | "models" }>();
  const draft = draftRuleStore.use();
  const names = useRuleNames();
  const providers = useProviders();
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const all = type === "labs"
      ? [...names.labs.entries()].map(([id, name]) => ({ id, name }))
      : (providers.data ?? []).map((provider) => ({ id: provider.api_provider_id, name: provider.api_provider_name }));
    const search = query.trim().toLocaleLowerCase();
    return all.filter((option) => !search || option.name.toLocaleLowerCase().includes(search)).sort((a, b) => a.name.localeCompare(b.name));
  }, [type, names.labs, providers.data, query]);
  if (!draft) return <EmptyState title="Nothing to pick for" />;
  const done = <Button label="Done" size="sm" variant="ghost" onPress={() => router.back()} />;
  if (type === "models") {
    return (
      <View className="flex-1">
        <Header title={`Models · ${draft.models.length}`} right={done} />
        <ModelPicker selected={draft.models} onSelect={(model) => draftRuleStore.set({ ...draft, models: draft.models.includes(model.model_id) ? draft.models.filter((id) => id !== model.model_id) : [...draft.models, model.model_id].slice(0, 200) })} />
      </View>
    );
  }
  const scope = type === "labs" ? draft.labs : draft.providers;
  const setIds = (ids: string[]) => draftRuleStore.set({ ...draft, [type === "labs" ? "labs" : "providers"]: { mode: scope.mode === "all" ? "only" : scope.mode, ids } });
  return (
    <View className="flex-1">
      <Header title={`${type === "labs" ? "Labs" : "Providers"} · ${scope.ids.length}`} right={done} />
      <View className="px-4 pb-2"><SearchField value={query} onChangeText={setQuery} placeholder={type === "labs" ? "Search labs" : "Search providers"} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-10">
        {options.map((option, index) => (
          <Row
            key={option.id}
            title={option.name}
            chevron={false}
            trailing={scope.ids.includes(option.id) ? <Icon icon={Check} tone="primary" size={18} /> : null}
            onPress={() => setIds(scope.ids.includes(option.id) ? scope.ids.filter((id) => id !== option.id) : [...scope.ids, option.id])}
            last={index === options.length - 1}
          />
        ))}
      </ScrollView>
    </View>
  );
}
