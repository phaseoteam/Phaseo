import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { Camera, ClipboardPaste } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button, Callout, Header, LoadingState, Screen, Section, Text, TextField } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { pairDesktop, readPairingLink } from "./pairing";
import { chooseDesktop } from "./picked";
import { CODE_HREF } from "./routes";
import type { FetchLike } from "./reach";
import { saveDesktop } from "./store";
import { openNativeSocket } from "./transport";

const deviceName = () => Device.deviceName ?? Device.modelName ?? "Phone";
const nameOf = (text: string): { name?: string; error?: string } => {
  try { return { name: readPairingLink(text).desktopName }; } catch (problem) { return { error: problem instanceof Error ? problem.message : "This pairing code is damaged." }; }
};

/**
 * Pairs with Phaseo on a computer: scan the code from its Settings → Phone, open its phaseo://pair link, or paste the
 * link. A link that opened the app starts pairing at once.
 */
export function PairScreen({ link }: { link?: string }) {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [pasted, setPasted] = useState("");
  // A link that opened the app is checked at once, so the screen starts out pairing (or saying what's wrong with it).
  const [pairing, setPairing] = useState<string | null>(() => (link ? nameOf(link).name ?? null : null));
  const [error, setError] = useState<string | null>(() => (link ? nameOf(link).error ?? null : null));
  const busy = useRef(false);

  const run = useCallback((text: string) => {
    busy.current = true;
    return pairDesktop(text, { fetch: fetch as unknown as FetchLike, openSocket: openNativeSocket, deviceName: deviceName() })
      .then(async (desktop) => {
        await saveDesktop(desktop);
        haptic("success");
        // Approvals and questions from the computer arrive as notifications while the app runs.
        const { status } = await Notifications.getPermissionsAsync();
        if (status === "undetermined") await Notifications.requestPermissionsAsync().catch(() => undefined);
        // Its threads are in Code, with it picked. Back returns to where pairing started (Desktops, or Code).
        chooseDesktop(desktop.desktopId);
        if (router.canGoBack()) router.back();
        else router.replace(CODE_HREF);
      })
      .catch((problem: unknown) => {
        haptic("error");
        setError(problem instanceof Error ? problem.message : "Pairing failed. Show a new code on the computer and try again.");
      })
      .finally(() => {
        busy.current = false;
        setPairing(null);
      });
  }, [router]);

  const pair = (text: string) => {
    if (busy.current) return;
    const { name, error: problem } = nameOf(text);
    if (!name) { setError(problem ?? null); return; }
    setError(null);
    setPairing(name);
    void run(text);
  };

  useEffect(() => {
    if (link && !busy.current && nameOf(link).name) void run(link);
  }, [link, run]);

  return (
    <Screen>
      <Header back title="Pair a computer" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-16">
          {pairing ? <LoadingState label={`Pairing with ${pairing}…`} /> : (
            <>
              <Text variant="muted" className="px-4">On the computer, open Phaseo, then Settings → Phone. Turn on Allow phone access and choose Pair a phone.</Text>
              {error ? <Callout tone="critical" role="alert" title="Couldn't pair" className="mx-4 mt-4">{error}</Callout> : null}
              <Section title="Scan the code">
                <View className="mx-4 aspect-square overflow-hidden rounded-md border border-border bg-muted">
                  {permission?.granted ? (
                    <CameraView
                      style={{ flex: 1 }}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                      onBarcodeScanned={({ data }) => pair(data)}
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center gap-3 px-8">
                      <Text variant="muted" className="text-center">{permission && !permission.canAskAgain ? "Camera access is off for Phaseo. Turn it on in Android settings, or paste the link below." : "Phaseo uses the camera only to read the code."}</Text>
                      {permission?.canAskAgain !== false ? <Button label="Use the camera" icon={Camera} variant="outline" onPress={() => void requestPermission()} /> : null}
                    </View>
                  )}
                </View>
              </Section>
              <Section title="Or paste the link" description="On the computer, choose Copy link beside the code.">
                <View className="gap-3 px-4">
                  <TextField value={pasted} onChangeText={setPasted} placeholder="phaseo://pair?p=…" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Pairing link" />
                  <View className="flex-row gap-2">
                    <Button label="Paste" icon={ClipboardPaste} variant="outline" onPress={() => void Clipboard.getStringAsync().then(setPasted)} />
                    <Button label="Pair" className="flex-1" disabled={!pasted.trim()} onPress={() => pair(pasted)} />
                  </View>
                </View>
              </Section>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
