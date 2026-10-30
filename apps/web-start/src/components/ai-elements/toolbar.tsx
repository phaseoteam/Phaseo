import { cn } from "@/lib/utils";
import { NodeToolbar, Position } from "@xyflow/react";
import type { ComponentProps } from "react";

type ToolbarProps = ComponentProps<typeof NodeToolbar>;

export const Toolbar = ({ className, ...props }: ToolbarProps) => (
  <NodeToolbar
    className={cn(
      "flex items-center gap-1 rounded-sm border border-neutral-200 bg-white p-1.5 dark:border-neutral-800 dark:bg-neutral-950",
      className
    )}
    position={Position.Bottom}
    {...props}
  />
);
