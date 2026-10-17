import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, LoadingState, Text } from "@/components/ui";
import { useAuth } from "@/providers/AuthProvider";

/** Opened by phaseo://auth/callback?code=… from an email sign-in link. */
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
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "This sign-in link didn't work."); });
    return () => { cancelled = true; };
  }, [url, completeSignIn, router]);

  if (!error) return <View className="flex-1 bg-background"><LoadingState className="flex-1" label="Signing you in…" /></View>;
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
      <Text variant="heading">{"Couldn't sign you in"}</Text>
      <Text variant="muted" className="text-center">{error} Links work once and expire after an hour.</Text>
      <Button label="Try again" onPress={() => router.replace("/sign-in")} />
    </View>
  );
}
