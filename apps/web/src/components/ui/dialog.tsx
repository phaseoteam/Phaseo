import * as React from "react"
import { useTranslations } from "@/i18n/react"
import {
  DialogContent as SharedDialogContent,
  DialogFooter as SharedDialogFooter,
} from "@phaseo/ui/dialog"

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@phaseo/ui/dialog"

// The shared dialog takes its "Close" text as a prop; the website passes its translation.
function DialogContent(props: React.ComponentProps<typeof SharedDialogContent>) {
  const t = useTranslations("Common.accessibility")
  return <SharedDialogContent closeLabel={t("close")} {...props} />
}

function DialogFooter(props: React.ComponentProps<typeof SharedDialogFooter>) {
  const t = useTranslations("Common.accessibility")
  return <SharedDialogFooter closeLabel={t("close")} {...props} />
}

export { DialogContent, DialogFooter }
