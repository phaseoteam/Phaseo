import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { buttonVariants } from "./button";

/**
 * T3 Code's toasts (components/ui/toast.tsx), trimmed: a Base UI toast manager anyone can call, and a viewport in the
 * top right. `toastManager.add({ type, title, description, actionProps })` returns an id that `update` and `close` take.
 */
export const toastManager = Toast.createToastManager();
const icons: Partial<Record<string, typeof Info>> = { error: CircleAlert, info: Info, success: CircleCheck, warning: TriangleAlert, loading: LoaderCircle };

function Toasts() {
	const { toasts } = Toast.useToastManager();
	return <Toast.Portal>
		<Toast.Viewport className="fixed top-14 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-90 flex-col gap-2 outline-none">
			{toasts.map(toast => {
				const Icon = icons[toast.type ?? ""];
				return <Toast.Root key={toast.id} toast={toast} swipeDirection={["right", "up"]} data-type={toast.type}
					className="relative w-full rounded-lg border border-border/60 bg-popover text-popover-foreground shadow-xl shadow-black/25 transition-[transform,opacity] duration-300 select-none data-ending-style:opacity-0 data-starting-style:translate-x-[calc(100%+1rem)] data-ending-style:data-[swipe-direction=right]:translate-x-[calc(100%+1rem)]">
					<Toast.Content className="flex items-center justify-between gap-2 py-3 pr-8 pl-3.5 text-sm">
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<div className="flex min-w-0 gap-2">
								{Icon && <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", toast.type === "error" && "text-destructive", toast.type === "success" && "text-emerald-600 dark:text-emerald-400", toast.type === "warning" && "text-amber-600 dark:text-amber-400", toast.type === "loading" && "animate-spin opacity-80")} />}
								<Toast.Title className="min-w-0 font-medium [overflow-wrap:anywhere]" />
							</div>
							<Toast.Description className={cn("text-xs text-muted-foreground [overflow-wrap:anywhere]", Icon && "pl-6")} />
						</div>
						{toast.actionProps?.children ? <Toast.Action className={cn(buttonVariants({ size: "xs", variant: "outline" }), "shrink-0")} /> : null}
					</Toast.Content>
					<Toast.Close aria-label="Dismiss notification" className="absolute top-2 right-2 grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-3" /></Toast.Close>
				</Toast.Root>;
			})}
		</Toast.Viewport>
	</Toast.Portal>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
	return <Toast.Provider toastManager={toastManager} timeout={5000}>{children}<Toasts /></Toast.Provider>;
}
