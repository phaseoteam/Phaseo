import { Search, X } from "lucide-react-native";
import type { ComponentRef, Ref } from "react";
import { Pressable, TextInput, type TextInputProps, View } from "react-native";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

type InputRef = Ref<ComponentRef<typeof TextInput>>;

export function SearchField({ value, onChangeText, className, placeholder = "Search", ref, ...props }: Omit<TextInputProps, "onChangeText" | "value"> & { value: string; onChangeText(value: string): void; className?: string; ref?: InputRef }) {
  return (
    <View className={cn("h-11 flex-row items-center gap-2 rounded-md bg-muted px-3", className)}>
      <Icon icon={Search} tone="muted" size={17} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        {...props}
        className="h-11 flex-1 font-sans text-[15px] text-foreground"
        placeholderTextColorClassName="accent-muted-foreground"
        cursorColorClassName="accent-primary"
      />
      {value ? (
        <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChangeText("")}>
          <Icon icon={X} tone="muted" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function TextField({ className, ref, ...props }: TextInputProps & { className?: string; ref?: InputRef }) {
  return (
    <TextInput
      ref={ref}
      {...props}
      className={cn("min-h-11 rounded-md border border-input bg-background px-3 py-2.5 font-sans text-[15px] text-foreground", className)}
      placeholderTextColorClassName="accent-muted-foreground"
      cursorColorClassName="accent-primary"
    />
  );
}
