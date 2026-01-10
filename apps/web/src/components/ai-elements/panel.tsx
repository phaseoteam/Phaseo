import { cn } from "@/lib/utils";
import { Panel as PanelPrimitive } from "@xyflow/react";
import type { ComponentProps } from "react";

type PanelProps = ComponentProps<typeof PanelPrimitive>;

export const Panel = ({ className, ...props }: PanelProps) => (
  <PanelPrimitive
    className={cn(
      "m-4 overflow-hidden rounded-md border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-950",
      className
    )}
    {...props}
  />
);
