import { Bug, ChevronDown, ChevronUp, ExternalLink } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Markdown } from "@/components/Markdown";
import { Button, confirm, Icon, Text } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import type { DesktopClient } from "../client";
import type { PhoneChatDetail, PhoneIssueDraft } from "../protocol";
import { ISSUE_STATUS } from "./triageState";

/**
 * The issue a triage thread's agent drafted, over the composer: its title, the body when opened, and File issue or
 * Discard while it waits (with Make changes). The computer files it on GitHub; the agent never does.
 */
export function IssueDraftCard({ client, chatId, draft, canFile, onChanged, onFailure }: {
  client: DesktopClient;
  chatId: string;
  draft: PhoneIssueDraft;
  canFile: boolean;
  onChanged(chat: PhoneChatDetail): void;
  onFailure(title: string, problem: unknown): void;
}) {
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"file" | "discard" | null>(null);
  if (draft.status === "discarded") return null;

  const act = async (action: "file" | "discard") => {
    if (action === "file" && !(await confirm({ title: `File this issue on ${draft.repository}?`, body: "It's created on GitHub with the computer's GitHub account, and anyone who can see the repository can read it.", confirmLabel: "File issue" }))) return;
    setBusy(action);
    haptic("press");
    try {
      const { chat } = await client.request("issue_draft", { chatId, action }, { live: true });
      haptic("success");
      onChanged(chat);
    } catch (problem) {
      onFailure(action === "file" ? "Couldn't file the issue" : "Couldn't discard the draft", problem);
    } finally {
      setBusy(null);
    }
  };

  const filed = draft.status === "filed";
  return (
    <View className="mb-3 gap-2.5 rounded-md border border-border bg-card p-4">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${ISSUE_STATUS[draft.status]} for ${draft.repository}: ${draft.title}`} onPress={() => setOpen(!open)} className="flex-row items-start gap-2">
        <Icon icon={Bug} tone="muted" size={15} />
        <View className="flex-1 gap-0.5">
          <Text variant="caption" className="font-semibold">{filed && draft.number ? `${ISSUE_STATUS.filed} · ${draft.repository}#${draft.number}` : `${ISSUE_STATUS[draft.status]} · ${draft.repository}`}</Text>
          <Text variant="body" className="font-semibold" numberOfLines={open ? undefined : 2}>{draft.title}</Text>
        </View>
        <Icon icon={open ? ChevronUp : ChevronDown} tone="muted" size={16} />
      </Pressable>
      {open ? (
        <ScrollView style={{ maxHeight: height * 0.35 }} className="grow-0" nestedScrollEnabled>
          <Markdown text={draft.body} />
          {draft.truncated ? <Text variant="caption" className="mt-1">Shortened for the phone. The whole draft is filed.</Text> : null}
        </ScrollView>
      ) : null}
      {filed ? (
        draft.url ? <Button label="Open on GitHub" icon={ExternalLink} variant="outline" size="sm" onPress={() => void Linking.openURL(draft.url!)} /> : null
      ) : canFile ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" label="File issue" size="sm" loading={busy === "file"} disabled={busy !== null} onPress={() => void act("file")} />
          <Button className="flex-1" label="Discard" size="sm" variant="outline" loading={busy === "discard"} disabled={busy !== null} onPress={() => void act("discard")} />
        </View>
      ) : (
        <Text variant="caption">File or discard it on the computer, or allow Make changes for this phone there.</Text>
      )}
    </View>
  );
}
