import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { useEffect, useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { View } from "react-native";
import { Button, Divider, Screen, Text, TextField } from "@/components/ui";
import { useAuth, type OAuthProvider } from "@/providers/AuthProvider";

export default function SignInScreen() {
  const router = useRouter();
  const { session, configured, signInWithProvider, sendEmailLink } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<OAuthProvider | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (session && router.canGoBack()) router.back();
  }, [session, router]);

  async function run(kind: OAuthProvider | "email", action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      if (kind === "email") setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen edges={[]} className="bg-popover">
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text variant="title">Sign in to Phaseo</Text>
        <Text variant="muted" className="mt-1">Sign in once to chat, see your usage and manage your workspace. Browsing models never needs an account.</Text>
        {!configured ? <Text variant="small" className="mt-4 text-destructive">{"Sign-in isn't set up in this build."}</Text> : null}
        <View className="mt-6 gap-2">
          <Button label="Continue with Google" variant="outline" loading={busy === "google"} disabled={!configured || busy != null} onPress={() => void run("google", () => signInWithProvider("google"))} />
          <Button label="Continue with GitHub" variant="outline" loading={busy === "github"} disabled={!configured || busy != null} onPress={() => void run("github", () => signInWithProvider("github"))} />
        </View>
        <View className="my-6 flex-row items-center gap-3">
          <Divider className="flex-1" />
          <Text variant="caption">or</Text>
          <Divider className="flex-1" />
        </View>
        {sent ? (
          <View className="gap-1">
            <Text variant="label">Check your email</Text>
            <Text variant="muted">Open the link we sent to {email.trim()} on this phone to finish signing in.</Text>
            <Button label="Use a different email" variant="ghost" size="sm" className="mt-2 self-start" onPress={() => setSent(false)} />
          </View>
        ) : (
          <View className="gap-2">
            <TextField value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="send" onSubmitEditing={() => email.trim() && void run("email", () => sendEmailLink(email.trim()))} />
            <Button label="Email me a sign-in link" icon={Mail} loading={busy === "email"} disabled={!configured || busy != null || !email.includes("@")} onPress={() => void run("email", () => sendEmailLink(email.trim()))} />
          </View>
        )}
        {error ? <Text variant="small" className="mt-4 text-destructive">{error}</Text> : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
