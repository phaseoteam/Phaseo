import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";
import { toast } from "@/components/ui/overlayStore";
import { haptic } from "@/lib/haptics";

/**
 * Copies text with the app's copy feedback. Android 13 and later show their own clipboard confirmation, so the app
 * only confirms copies on older versions; the success haptic plays either way.
 */
export function copyWithNotice(text: string, what: string) {
  void Clipboard.setStringAsync(text);
  haptic("success");
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) toast(`Copied the ${what}.`, { tone: "success" });
}
