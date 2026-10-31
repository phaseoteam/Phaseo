import * as React from "react"
import { useTranslations } from "@/i18n/react"
import { CommandDialog as SharedCommandDialog } from "@phaseo/ui/command"

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@phaseo/ui/command"

// The shared dialog takes its "Close" text as a prop; the website passes its translation.
function CommandDialog(props: React.ComponentProps<typeof SharedCommandDialog>) {
  const t = useTranslations("Common.accessibility")
  return <SharedCommandDialog closeLabel={t("close")} {...props} />
}

export { CommandDialog }
