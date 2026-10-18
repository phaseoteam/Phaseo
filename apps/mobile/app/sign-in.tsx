import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { LogoMark } from "@/components/Logo";
import { Button, Divider, Screen, Text, TextField } from "@/components/ui";
import { WEB_ORIGIN } from "@/lib/config";
import { authErrorMessage, useAuth, type OAuthProvider } from "@/providers/AuthProvider";

type Busy = OAuthProvider | "password" | "code" | null;

const OAUTH_PROVIDERS: [OAuthProvider, string][] = [["google", "Google"], ["github", "GitHub"], ["gitlab", "GitLab"]];

export default function SignInScreen() {
  const router = useRouter();
  const { session, mfaPending, configured, signInWithProvider, signInWithPassword, verifyMfa, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && router.canGoBack()) router.back();
  }, [session, router]);

  async function run(kind: Busy, action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  const openWeb = (path: string) => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}${path}`);

  if (mfaPending) {
    return (
      <Screen edges={[]} className="bg-popover">
        <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text variant="title">Enter your code</Text>
          <Text variant="muted" className="mt-1">Your account uses two-factor authentication. Enter the 6-digit code from your authenticator app.</Text>
          <TextField
            className="mt-6 text-center text-[22px] tracking-[6px]"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoFocus
            onSubmitEditing={() => code.length === 6 && void run("code", () => verifyMfa(code))}
          />
          <Button className="mt-3" label="Verify" loading={busy === "code"} disabled={code.length !== 6 || busy != null} onPress={() => void run("code", () => verifyMfa(code))} />
          <Button className="mt-2" label="Use a different account" variant="ghost" onPress={() => void signOut()} />
          {error ? <Text variant="small" className="mt-4 text-destructive">{error}</Text> : null}
        </KeyboardAwareScrollView>
      </Screen>
    );
  }

  const canSubmit = configured && busy == null && email.includes("@") && password.length > 0;
  const submit = () => canSubmit && void run("password", () => signInWithPassword(email.trim(), password));

  return (
    <Screen edges={[]} className="bg-popover">
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Image source={require("../assets/phaseo-icon.png")} style={{ width: 48, height: 48, borderRadius: 8 }} accessibilityLabel="Phaseo" />
        <Text variant="title" className="mt-4">Sign in to Phaseo</Text>
        <Text variant="muted" className="mt-1">Sign in once to chat, see your usage and manage your workspace. Browsing models never needs an account.</Text>
        {!configured ? <Text variant="small" className="mt-4 text-destructive">{"Sign-in isn't set up in this build."}</Text> : null}
        <View className="mt-6 gap-2">
          {OAUTH_PROVIDERS.map(([provider, name]) => (
            <Button
              key={provider}
              label={`Continue with ${name}`}
              variant="outline"
              leading={<LogoMark id={provider} size={20} />}
              loading={busy === provider}
              disabled={!configured || busy != null}
              onPress={() => void run(provider, () => signInWithProvider(provider))}
            />
          ))}
        </View>
        <View className="my-6 flex-row items-center gap-3">
          <Divider className="flex-1" />
          <Text variant="caption">or</Text>
          <Divider className="flex-1" />
        </View>
        <View className="gap-2">
          <TextField value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
          <TextField value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
          <Button label="Sign in" loading={busy === "password"} disabled={!canSubmit} onPress={submit} />
        </View>
        {error ? <Text variant="small" className="mt-4 text-destructive">{error}</Text> : null}
        <View className="mt-6 flex-row flex-wrap justify-between gap-3">
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => openWeb("/sign-in")}>
            <Text variant="small" className="font-semibold text-link">Forgot your password?</Text>
          </Pressable>
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => openWeb("/sign-up")}>
            <Text variant="small" className="font-semibold text-link">Create an account</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
