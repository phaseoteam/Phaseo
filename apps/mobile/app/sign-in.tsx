import { Github, Mail } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen, usePalette } from "@/components/ui";
import { useAuth } from "@/providers/AppProviders";
import { colour, font, radius, space } from "@/theme";

export default function SignInScreen() {
  const { signInWithEmail, signInWithProvider } = useAuth();
  const router = useRouter();
  const palette = usePalette();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) Alert.alert("Check your email", success);
      else router.back();
    } catch (error) {
      Alert.alert("Sign-in failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <Screen headerTitle="Sign in" headerBack><View style={styles.content}>
    <Text style={[styles.title, { color: palette.text }]}>Continue to Phaseo</Text>
    <Text style={[styles.body, { color: palette.muted }]}>Sign in to access your workspaces, usage and account settings.</Text>
    <Pressable disabled={busy} onPress={() => void run(() => signInWithProvider("google"))} style={[styles.button, { borderColor: palette.border }]}><Text style={{ color: palette.text, fontFamily: font.semibold }}>Continue with Google</Text></Pressable>
    <Pressable disabled={busy} onPress={() => void run(() => signInWithProvider("github"))} style={[styles.button, { borderColor: palette.border }]}><Github color={palette.text} size={18} /><Text style={{ color: palette.text, fontFamily: font.semibold }}>Continue with GitHub</Text></Pressable>
    <View style={styles.emailRow}><TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={palette.muted} style={[styles.input, { borderColor: palette.border, color: palette.text }]} /><Pressable disabled={busy || !email.trim()} onPress={() => void run(() => signInWithEmail(email.trim()), "Open the secure link on this device to finish signing in.")} style={[styles.mailButton, { opacity: busy || !email.trim() ? 0.45 : 1 }]}><Mail color={colour.white} size={18} /></Pressable></View>
  </View></Screen>;
}

const styles = StyleSheet.create({ content: { padding: space.xl, gap: space.lg }, title: { fontFamily: font.bold, fontSize: 28, letterSpacing: -0.5 }, body: { fontFamily: font.regular, fontSize: 14, lineHeight: 22 }, button: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: space.sm }, emailRow: { flexDirection: "row", gap: space.sm }, input: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, fontFamily: font.regular, fontSize: 14 }, mailButton: { width: 50, borderRadius: radius.md, backgroundColor: colour.blue, alignItems: "center", justifyContent: "center" } });
