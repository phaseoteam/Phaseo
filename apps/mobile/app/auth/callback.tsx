import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, LoadingState, Text } from "@/components/ui";
import { authErrorMessage, useAuth } from "@/providers/AuthProvider";

/** Opened by phaseo://auth/callback?code=… when a Google, GitHub or GitLab sign-in returns to the app. */
export default function AuthCallback() {
  const router = useRouter();
  const url = Linking.useLinkingURL();
  const { completeSignIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void completeSignIn(url)
      .then(() => { if (!cancelled) router.replace("/account"); })
      .catch((cause) => { if (!cancelled) setError(authErrorMessage(cause)); });
    return () => { cancelled = true; };
  }, [url, completeSignIn, router]);

  if (!error) return <View className="flex-1 bg-background"><LoadingState className="flex-1" label="Signing you in…" /></View>;
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
      <Text variant="heading">{"Couldn't sign you in"}</Text>
      <Text variant="muted" className="text-center">{error}</Text>
      <Button label="Try again" onPress={() => router.replace("/sign-in")} />
    </View>
  );
}
