import { Toast } from "@base-ui/react/toast"
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react"

import { cn } from "../../lib/utils"

/**
 * One app-wide toast stack: `toastManager.add({ type, title, description })` from anywhere, with an
 * optional `actionProps` button. Errors stay until dismissed; everything else leaves on its own.
 */
export const toastManager = Toast.createToastManager()
export type ToastType = "success" | "error" | "info" | "warning" | "loading"

const icons = { success: CircleCheck, error: CircleAlert, info: Info, warning: TriangleAlert, loading: LoaderCircle } as const
const tones: Record<ToastType, string> = { success: "text-success", error: "text-destructive", info: "text-info", warning: "text-warning", loading: "text-muted-foreground animate-spin" }

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map(toast => {
    const type = (toast.type ?? "info") as ToastType, Icon = icons[type] ?? Info
    return <Toast.Root key={toast.id} toast={toast} data-toast-type={type} className="absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] flex w-full origin-bottom items-start gap-2 rounded-md border border-border/60 bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg transition-[transform,opacity] duration-200 ease-out select-none [transform:translateY(calc(var(--toast-index)*-0.6rem))_scale(calc(1-var(--toast-index)*0.04))] data-[ending-style]:opacity-0 data-[expanded]:[transform:translateY(calc(var(--toast-offset-y)*-1-var(--toast-index)*0.5rem))] data-[limited]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0">
      <Icon aria-hidden className={cn("mt-px size-3.5 shrink-0", tones[type])} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Toast.Title className="font-medium text-foreground [overflow-wrap:anywhere]" />
        <Toast.Description className="text-muted-foreground [overflow-wrap:anywhere]" />
        {toast.actionProps && <span className="mt-1.5 flex"><Toast.Action className="inline-flex h-6 cursor-pointer items-center rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-muted" /></span>}
      </div>
      <Toast.Close aria-label="Dismiss" className="-mt-0.5 -mr-1 grid size-5 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><X aria-hidden className="size-3" /></Toast.Close>
    </Toast.Root>
  })
}

/** Mounted once at the app root. */
export function Toaster() {
  return <Toast.Provider toastManager={toastManager} timeout={4000} limit={4}>
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 w-[min(22rem,calc(100vw-2rem))]"><ToastList /></Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>
}

/** Errors wait to be read; the rest go after the default timeout. */
export function showToast(type: ToastType, title: string, description?: string, action?: { label: string; onClick: () => void }) {
  return toastManager.add({ type, title, ...(description ? { description } : {}), ...(type === "error" ? { timeout: 0 } : {}), ...(action ? { actionProps: { children: action.label, onClick: action.onClick } } : {}) })
}
