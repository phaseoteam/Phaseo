import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import { useRouter } from "expo-router";
import { Bot, Bug, Check, CircleAlert, Copy, ExternalLink, Monitor, RotateCcw, Square } from "lucide-react-native";
import { useState } from "react";
import { Linking, Platform, ScrollView, View } from "react-native";
import { Markdown } from "@/components/Markdown";
import { Button, Callout, Header, Icon, ReadableWidth, Row, Screen, Section, Switch, Text, TextField, toast } from "@/components/ui";
import { ChatModelSheet } from "@/features/chat/ChatModelSheet";
import { useModelLabels } from "@/features/chat/models";
import { chatModelStore, draftSettingsStore } from "@/features/chat/state";
import { workspaceDesktop, workspaceStore } from "@/features/desktops/picked";
import { desktopTriageHref } from "@/features/desktops/routes";
import { useDesktops } from "@/features/desktops/store";
import { triageDiagnostics } from "@/features/desktops/triage/triageState";
import { BUILD_DIRTY, BUILD_NUMBER, BUILD_SHA, deviceName, FULL_VERSION_LABEL, osName } from "@/lib/appInfo";
import { APP_VERSION } from "@/lib/config";
import { slowLog } from "@/lib/diagnostics";
import { formatUsd } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { newIssueUrl, type IssueDraft, type TriageStep } from "./agent";
import { clearTriage, startTriage, stopTriage, triageRun } from "./run";

const appName = () => `Phaseo for ${Platform.OS === "ios" ? "iOS" : "Android"}`;

/**
 * Triage a bug in this app from the phone: an agent reads this build's own source on GitHub through the Phaseo API,
 * finds the cause and can draft an issue, which only the person files. A paired computer can go further (fix and test).
 */
export function PhoneTriageScreen() {
  const run = triageRun.use();
  return (
    <Screen>
      <Header back title="Triage a bug" />
      {run.status === "idle" ? <TriageForm /> : <TriageProgress />}
    </Screen>
  );
}

function TriageForm() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const models = chatModelStore.use();
  const settings = draftSettingsStore.use();
  const labels = useModelLabels();
  const desktops = useDesktops();
  const pickedDesktop = workspaceStore.use();
  const computer = workspaceDesktop(desktops, pickedDesktop) ?? desktops?.[0] ?? null;
  const [text, setText] = useState("");
  const [diagnostics, setDiagnostics] = useState(true);
  const [picking, setPicking] = useState(false);
  const slow = slowLog.list();
  const model = models[0] ?? null;

  const start = () => {
    if (!model || !text.trim()) return;
    haptic("press");
    void startTriage({
      report: text.trim(),
      model,
      settings: settings[model],
      workspaceId,
      diagnostics: diagnostics ? triageDiagnostics(slow) : "",
      build: { app: appName(), version: APP_VERSION, buildNumber: BUILD_NUMBER, commit: BUILD_SHA && /^[0-9a-f]{40}$/i.test(BUILD_SHA) ? BUILD_SHA.toLowerCase() : null, dirty: BUILD_DIRTY, device: deviceName(), os: osName() || `${Device.osName ?? Platform.OS}` },
    });
  };

  return (
    <ScrollView contentContainerClassName="pb-16" keyboardShouldPersistTaps="handled">
      <ReadableWidth className="gap-3 px-4">
        <Text variant="muted">{"An agent reads this version's source on GitHub, finds what causes the problem and can draft an issue. Nothing is filed unless you file it."}</Text>
        <TextField
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          textAlignVertical="top"
          className="min-h-40"
          placeholder="What were you doing, what did you expect, and what happened instead?"
          accessibilityLabel="What went wrong"
        />
        <View className="-mx-4">
          <Row
            icon={Bot}
            title={model ? labels(model, settings[model]).label : "Choose a model"}
            subtitle="Your new chat model. Billed to your workspace like a chat."
            onPress={() => setPicking(true)}
          />
          <Row
            title="Include diagnostics"
            subtitle={slow.length ? `${slow.length} recent slow ${slow.length === 1 ? "operation" : "operations"}, with when and how long. Nothing from your chats.` : "No slow operations recorded since the app opened."}
            numberOfLines={3}
            trailing={<Switch value={diagnostics && slow.length > 0} disabled={!slow.length} accessibilityLabel="Include diagnostics" onValueChange={setDiagnostics} />}
            last
          />
        </View>
        <Text variant="caption">{`Sent with it: ${appName()} ${FULL_VERSION_LABEL}, ${deviceName()}.${BUILD_SHA ? "" : " This build doesn't carry its commit, so the agent reads the latest source instead."}`}</Text>
        <Button label="Start triage" icon={Bug} disabled={!model || !text.trim()} onPress={start} />
        {computer ? (
          <View className="-mx-4 mt-4">
            <Row icon={Monitor} title={`Fix it on ${computer.desktopName} instead`} subtitle="An agent there gets the source, fixes the bug and tests the fix" numberOfLines={2} onPress={() => router.push(desktopTriageHref(computer.desktopId))} last />
          </View>
        ) : null}
      </ReadableWidth>
      <ChatModelSheet chatId={null} models={models} settings={settings} open={picking} onClose={() => setPicking(false)} />
    </ScrollView>
  );
}

function StepRow({ step }: { step: TriageStep }) {
  return (
    <View className="flex-row gap-3 py-1.5">
      <View className="pt-0.5"><Icon icon={step.failed ? CircleAlert : Check} tone={step.failed ? "destructive" : "muted"} size={15} /></View>
      <View className="flex-1">
        <Text variant="small" numberOfLines={2}>{step.label}</Text>
        {step.detail ? <Text variant="caption" numberOfLines={1}>{step.detail}</Text> : null}
      </View>
    </View>
  );
}

function DraftCard({ draft }: { draft: IssueDraft }) {
  const copy = async () => {
    await Clipboard.setStringAsync(`${draft.title}\n\n${draft.body}`);
    haptic("success");
    toast("Issue draft copied");
  };
  const file = async () => {
    // The link carries a shortened body when the draft is long, so the whole draft is on the clipboard too.
    await Clipboard.setStringAsync(draft.body);
    await Linking.openURL(newIssueUrl(draft));
  };
  return (
    <Section title="Issue draft" description="Check it, then file it on GitHub yourself. The draft is also copied, in case GitHub shortens it.">
      <View className="gap-2 px-4">
        <Text variant="label">{draft.title}</Text>
        <View className="rounded-md border border-border p-3"><Markdown text={draft.body} /></View>
        <View className="flex-row gap-2 pt-1">
          <Button className="flex-1" label="File on GitHub" icon={ExternalLink} onPress={() => void file()} />
          <Button className="flex-1" variant="outline" label="Copy" icon={Copy} onPress={() => void copy()} />
        </View>
      </View>
    </Section>
  );
}

function TriageProgress() {
  const run = triageRun.use();
  const labels = useModelLabels();
  if (run.status === "idle") return null;
  const running = run.status === "running";
  return (
    <ScrollView contentContainerClassName="pb-16">
      <ReadableWidth>
        <View className="gap-2 px-4">
          <Text variant="caption">{`${labels(run.model).label} · ${appName()} ${FULL_VERSION_LABEL}`}</Text>
          <Text variant="body" numberOfLines={4}>{run.report}</Text>
        </View>
        <Section title={running ? "Working" : "What it did"}>
          <View className="px-4">
            {run.steps.map((step) => <StepRow key={step.id} step={step} />)}
            {running ? <Text variant="caption" className="pt-1.5">{run.live ? run.live.slice(-240) : run.steps.length ? "Thinking about what it found…" : "Starting…"}</Text> : null}
            {!running && !run.steps.length ? <Text variant="caption">{"It didn't read any code."}</Text> : null}
          </View>
        </Section>
        {run.status === "done" ? (
          <>
            {run.outcome.summary ? <Section title="What it found"><View className="px-4"><Markdown text={run.outcome.summary} /></View></Section> : null}
            {run.outcome.draft ? <DraftCard draft={run.outcome.draft} /> : null}
            {run.outcome.costUsd != null ? <Text variant="caption" className="px-4 pt-4">{`Cost ${formatUsd(run.outcome.costUsd)} over ${run.outcome.turns} ${run.outcome.turns === 1 ? "request" : "requests"}.`}</Text> : null}
          </>
        ) : null}
        {run.status === "failed" ? <View className="px-4 pt-4"><Callout tone="critical" role="alert" title="Triage stopped">{run.error ?? "Something went wrong."}</Callout></View> : null}
        {run.status === "stopped" ? <Text variant="muted" className="px-4 pt-4">You stopped this triage.</Text> : null}
        <View className="gap-2 px-4 pt-6">
          {running
            ? <Button variant="outline" label="Stop" icon={Square} onPress={stopTriage} />
            : <Button variant="outline" label="Triage another bug" icon={RotateCcw} onPress={clearTriage} />}
          {running ? <Text variant="caption">You can leave this screen; it keeps going while the app is open.</Text> : null}
        </View>
      </ReadableWidth>
    </ScrollView>
  );
}
