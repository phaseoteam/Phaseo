import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";
import { TEXT_VARIANTS, type TextVariant } from "@phaseo/app-kit/ui-recipes";
import { cn } from "@/lib/cn";

// The type scale is shared (packages/shared/app-kit/src/ui-recipes/text.ts).
export type { TextVariant };

export type TextProps = NativeTextProps & { variant?: TextVariant; className?: string };

/** Text boxes at the body size, without its line height, which misplaces the cursor in an Android text box. */
export const INPUT_TEXT = "font-sans text-[15px] text-foreground";

export function Text({ variant = "body", className, ...props }: TextProps) {
  return <NativeText {...props} className={cn("font-sans", TEXT_VARIANTS[variant], className)} />;
}
