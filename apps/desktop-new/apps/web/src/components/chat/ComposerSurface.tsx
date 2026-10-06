import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

/** A solid Phaseo card, shared by the prompt, attached banners and context strip. */
function Shell({
  contextStrip = false,
  className,
  ...props
}: ComponentProps<"div"> & { contextStrip?: boolean }) {
  return (
    <div
      data-slot="composer-shell"
      data-with-context={contextStrip || undefined}
      className={cn(
        "@container/composer-surface group/composer-surface relative isolate mx-auto w-full max-w-(--chat-content-max-width)",
        "[--chat-composer-drawer-inset:1.375rem] [--composer-radius:var(--radius)] [--chat-composer-glass-surface:var(--card)] [--chat-composer-outline:var(--border)] focus-within:[--chat-composer-outline:var(--ring)]",
        "before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-(--composer-radius) before:bg-(--chat-composer-glass-surface)",
        "has-data-[composer-banner-surface=attached]:before:hidden data-model-strip-transition:before:hidden",
        className,
      )}
      {...props}
    />
  );
}

const outlineClasses =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--chat-composer-outline)";

// The footer shares the full card width; omit the internal border and corners.
const contextSeamClasses =
  "group-data-with-context/composer-surface:rounded-b-none group-data-with-context/composer-surface:after:rounded-b-none group-data-with-context/composer-surface:after:border-b-0";

function Host({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-host"
      className={cn(
        "relative z-10 w-full rounded-(--composer-radius) shadow-sm after:z-1 dark:shadow-none",
        outlineClasses,
        contextSeamClasses,
        "group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-none group-has-data-[composer-banner-surface=attached]/composer-surface:after:hidden",
        className,
      )}
      {...props}
    />
  );
}

function Main({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-chat-composer-main-surface="true"
      className={cn(
        "group relative z-10 rounded-(--composer-radius) p-px",
        // The host also wraps shoulder tabs, so its backdrop would extend above the input.
        "group-data-model-strip-transition/composer-surface:bg-(--chat-composer-glass-surface)",
        outlineClasses,
        contextSeamClasses,
        "after:z-20 after:hidden group-has-data-[composer-banner-surface=attached]/composer-surface:after:block",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:bg-(--chat-composer-glass-surface)",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-sm dark:group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-none",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:**:data-[chat-composer-mobile-collapsed=true]:min-h-[calc(1rem+1px)]",
        className,
      )}
      {...props}
    />
  );
}

function ContextStrip({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-context-strip"
      className={cn(
        "group/composer-context relative isolate mx-auto flex w-full items-center gap-2 rounded-b-(--composer-radius) px-3 pt-1 pb-2",
        "before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-b-(--composer-radius) before:border before:border-t-0 before:border-(--chat-composer-outline) before:bg-(--chat-composer-glass-surface)",
        className,
      )}
      {...props}
    />
  );
}

export const ComposerSurface = { Shell, Host, Main, ContextStrip };
