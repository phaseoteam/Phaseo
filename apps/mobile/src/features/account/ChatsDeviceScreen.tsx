import { useFocusEffect, useRouter } from "expo-router";
import { FileOutput, Files, Trash2 } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { LogoMark } from "@/components/Logo";
import { Fact, Header, measureAnchor, ReadableWidth, Row, Screen, Section, Text, type ViewRef } from "@/components/ui";
import { askExportFormat, confirmDeleteAllChats } from "@/features/chat/chatActions";
import { readStorageReport, type StorageReport } from "@/features/chat/deviceStorage";
import { useChatModelOptions } from "@/features/chat/models";
import { chatModelStore } from "@/features/chat/state";
import { useLayout } from "@/hooks/useLayout";
import { formatBytes, formatNumber } from "@/lib/format";

/** What chat keeps on this phone: how much, the models new chats start with, export and delete. */
export function ChatsDeviceScreen() {
  const router = useRouter();
  const { split } = useLayout();
  const models = chatModelStore.use();
  const { byId } = useChatModelOptions();
  const [report, setReport] = useState<StorageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exportRef = useRef<ViewRef>(null);
  const read = useCallback(() => {
    try {
      setReport(readStorageReport());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read the chat database.");
    }
  }, []);
  useFocusEffect(read);
  const names = models.map((id) => byId.get(id)?.label ?? id.split("/").at(-1) ?? id);
  const empty = report ? report.chats === 0 : true;

  return (
    <Screen>
      <Header back={!split} title="Chats on this device" />
      <ScrollView contentContainerClassName="pb-16">
        <ReadableWidth>
          <Text variant="muted" className="px-4">Chats are kept only on this phone. They aren&apos;t backed up or synced, and phaseo.app can&apos;t see them.</Text>
          <Section title="Storage">
            {error ? <Text variant="small" className="px-4 py-3 text-destructive">{error}</Text> : report ? (
              <>
                <Fact label="Chats" value={formatNumber(report.chats)} />
                <Fact label="Messages" value={formatNumber(report.messages)} />
                <Fact label="Attachments" value={`${formatNumber(report.attachments)} · ${formatBytes(report.attachmentBytes)}`} />
                <Fact label="Database" value={formatBytes(report.databaseBytes + report.journalBytes)} />
                <Fact label="Space used" value={formatBytes(report.totalBytes)} last />
              </>
            ) : null}
          </Section>
          <Section title="Default models for new chats" description="New chats start with these. Each chat keeps its own models after that.">
            <Row
              leading={(
                <View className="w-7 flex-row items-center justify-center">
                  {models.slice(0, 2).map((id, index) => <View key={id} style={{ marginLeft: index ? -6 : 0 }}><LogoMark id={byId.get(id)?.orgId ?? id.split("/")[0]!} size={18} /></View>)}
                </View>
              )}
              title={names.length ? names.join(", ") : "No models chosen yet"}
              subtitle={models.length > 1 ? `${models.length} models answer side by side` : "Tap to choose. Up to 4 can answer side by side."}
              numberOfLines={2}
              onPress={() => router.push({ pathname: "/sheets/[kind]", params: { kind: "chat-models" } })}
              last
            />
          </Section>
          <Section title="Export" description="Markdown to read, or JSON with every detail. Shared through Android's share sheet.">
            <View ref={exportRef} collapsable={false}>
              <Row icon={Files} title="Export all chats" subtitle={report ? `${formatNumber(report.chats)} chats` : null} onPress={() => void measureAnchor(exportRef).then((anchor) => askExportFormat("all", anchor))} chevron={false} />
            </View>
            <Row icon={FileOutput} title="Export one chat" onPress={() => router.push({ pathname: "/sheets/[kind]", params: { kind: "export-chat" } })} last />
          </Section>
          <Section>
            <Row
              icon={Trash2}
              title="Delete all chats on this device"
              subtitle={empty ? "There are no chats to delete." : "Chats and their attachments. This can't be undone."}
              destructive
              chevron={false}
              last
              onPress={empty ? undefined : () => void confirmDeleteAllChats(report!.chats).then((deleted) => { if (deleted) read(); })}
            />
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
