import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import { useFocusEffect } from "expo-router";
import { Copy, Share2 } from "lucide-react-native";
import { useCallback, useState, useSyncExternalStore } from "react";
import { PixelRatio, ScrollView, Share, useWindowDimensions, View } from "react-native";
import { Button, Fact, Header, ReadableWidth, Screen, Section, Text, toast, toastError } from "@/components/ui";
import { databasePages } from "@/features/chat/db";
import { readStorageReport, type StorageReport } from "@/features/chat/deviceStorage";
import { SCHEMA_VERSION } from "@/features/chat/migrations";
import { useLayout } from "@/hooks/useLayout";
import { BUILD_COMMIT, BUILT_AT, deviceName, osName } from "@/lib/appInfo";
import { APP_VERSION } from "@/lib/config";
import { slowLog } from "@/lib/diagnostics";
import { formatBytes, formatNumber } from "@/lib/format";
import { diagnosticsText, slowOperationLine, type DiagnosticsSection } from "./diagnosticsReport";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const ago = (at: number, now: number) => {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return seconds < 60 ? `${seconds} s ago` : seconds < 3600 ? `${Math.round(seconds / 60)} min ago` : `${Math.round(seconds / 3600)} h ago`;
};

type Database = { report: StorageReport; pages: ReturnType<typeof databasePages> } | { error: string };

/**
 * Like the desktop app's Settings → Diagnostics: the build, the phone, the chat database and the latest slow work,
 * to copy or share when something seems wrong. Everything stays on the device unless the user shares it.
 */
export function DiagnosticsScreen() {
  const { split } = useLayout();
  const window = useWindowDimensions();
  const [database, setDatabase] = useState<Database | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Re-renders when slow work is recorded or the list is cleared.
  useSyncExternalStore(slowLog.subscribe, () => slowLog.total, () => slowLog.total);
  const operations = slowLog.list();

  useFocusEffect(useCallback(() => {
    try {
      setDatabase({ report: readStorageReport(), pages: databasePages() });
    } catch (error) {
      setDatabase({ error: error instanceof Error ? error.message : "Couldn't read the chat database." });
    }
    setNow(Date.now());
  }, []));

  const engine = (globalThis as { HermesInternal?: unknown }).HermesInternal ? "Hermes" : "JavaScriptCore";
  const fabric = (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager ? "New architecture" : "Old architecture";
  const sections: DiagnosticsSection[] = [
    { title: "App", rows: [
      ["Version", APP_VERSION],
      ["Build", BUILD_COMMIT ? `${BUILD_COMMIT}${BUILT_AT ? `, ${when.format(Date.parse(BUILT_AT))}` : ""}` : "Not recorded"],
      ["Updates", "Built in (no over-the-air update channel)"],
      ["Engine", `${engine}, ${fabric}`],
    ] },
    { title: "Device", rows: [
      ["Model", deviceName()],
      ["System", osName()],
      ["Screen", `${Math.round(window.width)} × ${Math.round(window.height)} dp at ${PixelRatio.get()}×`],
      ...(Device.totalMemory ? [["Memory", formatBytes(Device.totalMemory)] as [string, string]] : []),
    ] },
    database && "report" in database ? { title: "Chat database", rows: [
      ["Schema version", database.pages.schemaVersion === SCHEMA_VERSION ? `${database.pages.schemaVersion} (current)` : `${database.pages.schemaVersion} (the app expects ${SCHEMA_VERSION})`],
      ["Chats", formatNumber(database.report.chats)],
      ["Messages", formatNumber(database.report.messages)],
      ["Summaries", formatNumber(database.report.summaries)],
      ["Attachments", `${formatNumber(database.report.attachments)} in messages, ${formatNumber(database.report.attachmentFiles)} files, ${formatBytes(database.report.attachmentBytes)}`],
      ["Database file", formatBytes(database.report.databaseBytes)],
      ["Journal", formatBytes(database.report.journalBytes)],
      ["Pages", `${formatNumber(database.pages.pageCount)} of ${formatBytes(database.pages.pageSize)}, ${formatNumber(database.pages.freePages)} free`],
    ] } : { title: "Chat database", rows: [["Error", database && "error" in database ? database.error : "Reading…"]] },
  ];
  const text = () => diagnosticsText(sections, operations, Date.now(), slowLog.threshold);

  return (
    <Screen>
      <Header back={!split} title="Diagnostics" />
      <ScrollView contentContainerClassName="pb-16">
        <ReadableWidth>
          <Text variant="muted" className="px-4">Details that help when something isn&apos;t working. They stay on this phone unless you copy or share them, and include nothing from your chats or account.</Text>
          <View className="flex-row gap-2 px-4 pt-3">
            <Button label="Copy" icon={Copy} variant="outline" size="sm" className="flex-1" onPress={() => void Clipboard.setStringAsync(text()).then(() => toast("Diagnostics copied."))} />
            <Button label="Share as text" icon={Share2} variant="outline" size="sm" className="flex-1" onPress={() => void Share.share({ message: text(), title: "Phaseo diagnostics" }).catch((error) => toastError("Couldn't share", error))} />
          </View>
          {sections.map((section) => (
            <Section key={section.title} title={section.title}>
              {section.rows.map(([label, value], index) => <Fact key={label} label={label} value={value} last={index === section.rows.length - 1} />)}
            </Section>
          ))}
          <Section
            title="Slow operations"
            description={`Work that took ${slowLog.threshold} ms or more since the app started, newest first: opening chats, loading pages, saving streamed text, building requests and summaries. Kept in memory only (the last ${slowLog.capacity}).`}
            action={operations.length ? <Button label="Clear" variant="ghost" size="sm" onPress={() => slowLog.clear()} /> : undefined}
          >
            {operations.length ? operations.map((operation, index) => (
              <View key={`${operation.at}-${index}`} className="flex-row items-start gap-3 border-b border-border px-4 py-2.5" accessible accessibilityLabel={slowOperationLine(operation)}>
                <View className="flex-1">
                  <Text variant="small" className="font-medium">{operation.name}</Text>
                  <Text variant="caption">{[operation.detail, ago(operation.at, now)].filter(Boolean).join(" · ")}</Text>
                </View>
                <Text variant="small" className="font-semibold">{`${formatNumber(operation.ms)} ms`}</Text>
              </View>
            )) : <Text variant="muted" className="px-4 py-3">Nothing slow so far.</Text>}
            {slowLog.total > operations.length ? <Text variant="caption" className="px-4 pt-2">{`${formatNumber(slowLog.total - operations.length)} older ones were dropped.`}</Text> : null}
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
