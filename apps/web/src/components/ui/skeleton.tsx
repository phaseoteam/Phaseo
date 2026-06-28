import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-oklch(0.97 0 0) dark:bg-oklch(0.269 0 0)", className)}
      {...props}
    />
  )
}

export { Skeleton }
