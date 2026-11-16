import { NumberInput as SharedNumberInput, type NumberInputProps } from "@phaseo/ui/number-input"
import { useTranslations } from "@/i18n/react"

export type { NumberInputProps }

/** The shared number input, with step button names from the message catalogue unless given. */
export function NumberInput({ decrementLabel, incrementLabel, ...props }: NumberInputProps) {
  const t = useTranslations("Common.ui.numberInput")
  return <SharedNumberInput {...props} decrementLabel={decrementLabel ?? t("decrease")} incrementLabel={incrementLabel ?? t("increase")} />
}
