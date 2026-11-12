import { Platform, Text as NativeText, type TextProps } from "react-native";
import { cn } from "@/lib/cn";

/** The app's type has no monospace face; code reads in the platform's, as Markdown's code blocks do. */
const MONO = { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) };

/** Code text: React Native's own, since the app's Text sets its sans face by class, which wins over a style. */
export function Code({ className, style, ...props }: TextProps & { className?: string }) {
  return <NativeText {...props} className={cn("text-[12px] text-muted-foreground", className)} style={[MONO, style]} />;
}
