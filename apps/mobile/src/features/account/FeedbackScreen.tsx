import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Copy, Mail } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Header, ReadableWidth, Screen, Text, TextField, toast } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { appSummaryLines } from "@/lib/appInfo";
import { openWeb } from "@/lib/web";

export const FEEDBACK_ADDRESS = "support@phaseo.app";

/** The email's text: the message, then the details the user kept (they can clear them). */
export function feedbackBody(message: string, details: string) {
  const extra = details.trim();
  return extra ? `${message.trim()}\n\n—\n${extra}` : message.trim();
}

/** The email the app opens, addressed to support with a subject and the text the user saw. */
export function feedbackMailto(body: string, subject = "Feedback on Phaseo for Android") {
  return `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Feedback by email: there's no feedback endpoint for the app to post to, so this writes the message here and hands
 * it to the email app, where it's sent from the user's own address. Nothing is sent until they send it there.
 */
export function FeedbackScreen() {
  const { split } = useLayout();
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState(() => appSummaryLines().join("\n"));
  const body = feedbackBody(message, details);

  const send = async () => {
    try {
      await Linking.openURL(feedbackMailto(body));
    } catch {
      await Clipboard.setStringAsync(body);
      toast(`No email app opened, so the text was copied. Paste it into an email to ${FEEDBACK_ADDRESS}, or use the contact page.`, { durationMs: 7000 });
      void openWeb("/contact");
    }
  };

  return (
    <Screen>
      <Header back={!split} title="Send feedback" />
      <ScrollView contentContainerClassName="pb-16" keyboardShouldPersistTaps="handled">
        <ReadableWidth className="gap-3 px-4">
          <Text variant="muted">{`What works, what doesn't, what you'd like next. This opens your email app with the text below, to ${FEEDBACK_ADDRESS}, so you can check it before it's sent.`}</Text>
          <TextField value={message} onChangeText={setMessage} multiline autoFocus textAlignVertical="top" className="min-h-40" placeholder="Your feedback" accessibilityLabel="Your feedback" />
          <View className="gap-1.5">
            <Text variant="label">Sent with it</Text>
            <TextField value={details} onChangeText={setDetails} multiline textAlignVertical="top" className="font-mono text-[13px]" accessibilityLabel="App version and device, sent with your feedback" />
            <Text variant="caption">The app version and phone help us reproduce problems. Edit or clear them if you like; no account details are added.</Text>
          </View>
          <View className="gap-2 pt-1">
            <Button label="Write the email" icon={Mail} disabled={!message.trim()} onPress={() => void send()} />
            <Button label="Copy the text" icon={Copy} variant="outline" disabled={!message.trim()} onPress={() => void Clipboard.setStringAsync(body).then(() => toast("Copied."))} />
          </View>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
