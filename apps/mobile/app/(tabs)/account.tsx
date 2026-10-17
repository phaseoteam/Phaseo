import { BellRing, BookOpen, CreditCard, KeyRound, LockKeyhole, LogOut, Palette, Shield, UserRound, UsersRound, WalletCards } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, ScrollView, Switch, TextInput } from "react-native";
import { PageIntro, Row, Screen, Section, usePalette } from "@/components/ui";
import { secureKey } from "@/lib/secureKey";
import { useAuth } from "@/providers/AppProviders";
import { useThemePreference, type ThemeMode } from "@/providers/ThemePreference";
import { colour, font } from "@/theme";
import { getMobileNotificationSettings, registerNotificationDevice, setNewModelNotifications, unregisterNotificationDevice } from "@/lib/api";
import { getNotificationInstallationId, registerForModelReleaseNotifications } from "@/lib/notifications";

const themeLabels: Record<ThemeMode, string> = { system: "System", light: "Light", dark: "Dark" };

export default function AccountScreen() {
  const { session, signOut } = useAuth(); const router = useRouter(); const p = usePalette(); const [key, setKey] = useState("");
  const [newModelNotifications, setNewModelNotificationState] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const { mode: themeMode, setMode: setThemeMode } = useThemePreference();
  useEffect(() => {
    if (!session?.access_token) {
      void Promise.resolve().then(() => setNewModelNotificationState(false));
      return;
    }
    let active = true;
    void getNotificationInstallationId().then(installationId => getMobileNotificationSettings(session.access_token, installationId)).then(settings => {
      if (active) setNewModelNotificationState(settings.newModelReleases && settings.deviceRegistered);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session?.access_token]);
  const toggleNewModelNotifications = async (enabled: boolean) => {
    if (!session?.access_token || notificationBusy) return;
    setNotificationBusy(true);
    try {
      if (enabled) {
        const device = await registerForModelReleaseNotifications();
        await registerNotificationDevice(session.access_token, device);
        await setNewModelNotifications(session.access_token, true);
      } else {
        await setNewModelNotifications(session.access_token, false);
        await unregisterNotificationDevice(session.access_token, await getNotificationInstallationId());
      }
      setNewModelNotificationState(enabled);
    } catch (error) {
      Alert.alert("Notifications unavailable", error instanceof Error ? error.message : "Phaseo could not update notification settings.");
    } finally {
      setNotificationBusy(false);
    }
  };
  const pickTheme = () => {
    Alert.alert("Theme", "Choose the appearance for this device.", [
      { text: "System", onPress: () => setThemeMode("system") },
      { text: "Light", onPress: () => setThemeMode("light") },
      { text: "Dark", onPress: () => setThemeMode("dark") },
      { text: "Cancel", style: "cancel" }
    ]);
  };
  return <Screen><ScrollView contentContainerStyle={{ paddingBottom: 56 }}><PageIntro eyebrow="Workspace" title="Account" body="Manage your Phaseo identity, workspace access, API key and appearance." /><Section title="Account"><Row icon={UserRound} title={session?.user.email ?? "Sign in"} subtitle={session ? "Profile, email and sign-in methods" : "Connect Google, GitHub or email"} onPress={session ? undefined : () => router.push("/sign-in")} /><Row icon={UsersRound} title="Workspace" subtitle="Members, roles and invitations" /></Section>
    <Section title="Usage and billing"><Row icon={WalletCards} title="Balance and spend" /><Row icon={CreditCard} title="Limits and payment management" /></Section>
    <Section title="API and chat" footer="The local key is encrypted by the operating system and is never written to settings storage, logs or analytics."><Row icon={KeyRound} title="Secure local key" subtitle="Stored only on this device" trailing={<TextInput value={key} onChangeText={setKey} onEndEditing={() => { if (key) void secureKey.set(key).then(() => { setKey(""); Alert.alert("Saved", "Your Phaseo key is protected on this device."); }); }} secureTextEntry placeholder="Paste key" placeholderTextColor={p.muted} style={{ color: p.text, fontFamily: font.regular, width: 110 }} />} /></Section>
    <Section title="Appearance"><Row icon={Palette} title="Theme and density" subtitle={`${themeLabels[themeMode]} theme · standard density`} onPress={pickTheme} /></Section>
    <Section title="Notifications" footer={session ? "You will only be notified when a model first becomes publicly available." : "Sign in to enable notifications on this device."}><Row icon={BellRing} title="New Model Releases" subtitle="Open notifications directly on the model page" trailing={<Switch value={newModelNotifications} disabled={!session || notificationBusy} onValueChange={value => void toggleNewModelNotifications(value)} trackColor={{ false: p.border, true: colour.blue }} />} /></Section>
    <Section title="Privacy and security"><Row icon={Shield} title="Biometrics, MFA and sessions" /><Row icon={LockKeyhole} title="I/O logging and analytics" /></Section>
    <Section title="Support"><Row icon={BookOpen} title="Documentation and status" /></Section>
    {session ? <Section title="Session"><Row icon={LogOut} title="Sign out" subtitle="Clears private caches and the local API key" onPress={() => void signOut()} /></Section> : null}</ScrollView></Screen>;
}
