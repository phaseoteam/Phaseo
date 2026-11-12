import * as Device from "expo-device";
import { useRouter } from "expo-router";
import { Bug, Monitor } from "lucide-react-native";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { Button, Callout, EmptyState, Header, ReadableWidth, Row, Screen, showActions, SkeletonRows, Switch, Text, TextField } from "@/components/ui";
import { BUILD_DIRTY, BUILD_NUMBER, BUILD_SHA, BUILT_AT, deviceName, FULL_VERSION_LABEL } from "@/lib/appInfo";
import { APP_VERSION } from "@/lib/config";
import { slowLog } from "@/lib/diagnostics";
import { haptic } from "@/lib/haptics";
import type { DesktopClient } from "../client";
import { ConnectionNotice } from "../CodeThreadList";
import { clientFor, useConnection } from "../connections";
import { desktopChatHref } from "../routes";
import { useDesktop, useDesktops } from "../store";
import { phoneBuild, TRIAGE_TIMEOUT_MS, triageBlocker, triageDiagnostics } from "./triageState";

const problemText = (error: unknown) => (error instanceof Error ? error.message : "That didn't work.");

/**
 * Triage a bug in this app: an agent on a paired computer works in this build's own source there (the computer
 * fetches it at the build's commit), finds the cause, fixes it and drafts an issue, which only the person files.
 */
export function TriageScreen({ desktopId }: { desktopId: string }) {
  const desktop = useDesktop(desktopId);
  if (desktop === undefined) return <Screen><Header back title="Triage a bug" /><SkeletonRows count={4} /></Screen>;
  if (!desktop) {
    return (
      <Screen>
        <Header back title="Triage a bug" />
        <EmptyState className="flex-1" icon={Monitor} title="Pair a computer first" body="An agent on one of your computers does the work. Pair one from Account → Desktops." />
      </Screen>
    );
  }
  return <TriageForm client={clientFor(desktop)} desktopId={desktopId} desktopName={desktop.desktopName} />;
}

function TriageForm({ client, desktopId, desktopName }: { client: DesktopClient; desktopId: string; desktopName: string }) {
  const router = useRouter();
  const connection = useConnection(client);
  const desktops = useDesktops() ?? [];
  const [text, setText] = useState("");
  const [diagnostics, setDiagnostics] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocker = triageBlocker(connection, desktopName);
  const slow = slowLog.list();
  const ready = connection.status === "connected" && !blocker;

  const start = async () => {
    setBusy(true); setError(null);
    haptic("press");
    try {
      const build = phoneBuild({ version: APP_VERSION, commit: BUILD_SHA, dirty: BUILD_DIRTY, buildNumber: BUILD_NUMBER, builtAt: BUILT_AT, platform: Platform.OS, osVersion: Device.osVersion ?? null, device: deviceName(), runtime: `React Native ${Object.values(Platform.constants.reactNativeVersion ?? {}).filter((part) => part != null && part !== "").join(".")}` });
      const notes = diagnostics ? triageDiagnostics(slow) : "";
      const started = await client.request("triage", { text: text.trim(), build, ...notes ? { diagnostics: notes } : {} }, { live: true, timeoutMs: TRIAGE_TIMEOUT_MS });
      haptic("success");
      router.replace(desktopChatHref(desktopId, started.chat.id));
    } catch (problem) {
      haptic("error");
      setError(problemText(problem));
      setBusy(false);
    }
  };

  const others = desktops.filter((entry) => entry.desktopId !== desktopId);
  return (
    <Screen>
      <Header back title="Triage a bug" />
      <ConnectionNotice client={client} />
      <ScrollView contentContainerClassName="pb-16" keyboardShouldPersistTaps="handled">
        <ReadableWidth className="gap-3 px-4">
          <Text variant="muted">{`An agent on ${desktopName} gets this version's source, finds the cause, fixes it there and can draft an issue. Nothing is filed unless you choose to file it.`}</Text>
          {others.length ? (
            <View className="-mx-4">
              <Row
                icon={Monitor}
                title={desktopName}
                subtitle="The computer that does the work"
                onPress={() => showActions({ title: "Triage on", actions: others.map((entry) => ({ key: entry.desktopId, label: entry.desktopName, icon: Monitor, onPress: () => router.setParams({ desktopId: entry.desktopId }) })) })}
                last
              />
            </View>
          ) : null}
          {blocker ? <Callout tone="warning" role="status">{blocker}</Callout> : null}
          <TextField
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            editable={!busy}
            textAlignVertical="top"
            className="min-h-40"
            placeholder="What were you doing, what did you expect, and what happened instead?"
            accessibilityLabel="What went wrong"
          />
          <View className="-mx-4">
            <Row
              title="Include diagnostics"
              subtitle={slow.length ? `${slow.length} recent slow ${slow.length === 1 ? "operation" : "operations"}, with when and how long. Nothing from your chats.` : "No slow operations recorded since the app opened."}
              numberOfLines={3}
              trailing={<Switch value={diagnostics} disabled={busy || !slow.length} accessibilityLabel="Include diagnostics" onValueChange={setDiagnostics} />}
              last
            />
          </View>
          <Text variant="caption">{`Sent with it: Phaseo for ${Platform.OS === "ios" ? "iOS" : "Android"} ${FULL_VERSION_LABEL}, ${deviceName()}.${BUILD_SHA ? "" : " This build doesn't carry its commit, so the computer uses the latest source instead."}`}</Text>
          {error ? <Callout tone="critical" role="alert" title="Couldn't start triage">{error}</Callout> : null}
          <View className="gap-2 pt-1">
            <Button label={busy ? "Getting the source…" : "Start triage"} icon={Bug} loading={busy} disabled={!ready || busy || !text.trim()} onPress={() => void start()} />
            {busy ? <Text variant="caption">The first triage of a version fetches its source onto the computer, which can take a few minutes. Keep the app open.</Text> : null}
          </View>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
