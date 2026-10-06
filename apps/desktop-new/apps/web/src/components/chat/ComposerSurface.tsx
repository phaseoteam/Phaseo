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
        contextStrip && [
          "[--chat-composer-context-extension:2.25rem] sm:[--chat-composer-context-extension:2rem]",
          // Keep one continuous backdrop around the fixed-pixel corners and rem-sized strip inset.
          "supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:rounded-none",
          "before:[clip-path:shape(from_0_var(--composer-radius),curve_to_var(--composer-radius)_0_with_0_calc(var(--composer-radius)*0.4477)/calc(var(--composer-radius)*0.4477)_0,line_to_calc(100%-var(--composer-radius))_0,curve_to_100%_var(--composer-radius)_with_calc(100%-calc(var(--composer-radius)*0.4477))_0/100%_calc(var(--composer-radius)*0.4477),line_to_100%_calc(100%-var(--chat-composer-context-extension)-var(--chat-composer-drawer-inset)),curve_to_calc(100%-var(--chat-composer-drawer-inset))_calc(100%-var(--chat-composer-context-extension))_with_100%_calc(100%-var(--chat-composer-context-extension)-var(--chat-composer-drawer-inset)*0.4477)/calc(100%-var(--chat-composer-drawer-inset)*0.4477)_calc(100%-var(--chat-composer-context-extension)),line_to_calc(100%-var(--chat-composer-drawer-inset))_calc(100%-var(--composer-radius)),curve_to_calc(100%-var(--chat-composer-drawer-inset)-var(--composer-radius))_100%_with_calc(100%-var(--chat-composer-drawer-inset))_calc(100%-calc(var(--composer-radius)*0.4477))/calc(100%-var(--chat-composer-drawer-inset)-calc(var(--composer-radius)*0.4477))_100%,line_to_calc(var(--chat-composer-drawer-inset)+var(--composer-radius))_100%,curve_to_var(--chat-composer-drawer-inset)_calc(100%-var(--composer-radius))_with_calc(var(--chat-composer-drawer-inset)+calc(var(--composer-radius)*0.4477))_100%/var(--chat-composer-drawer-inset)_calc(100%-calc(var(--composer-radius)*0.4477)),line_to_var(--chat-composer-drawer-inset)_calc(100%-var(--chat-composer-context-extension)),curve_to_0_calc(100%-var(--chat-composer-context-extension)-var(--chat-composer-drawer-inset))_with_calc(var(--chat-composer-drawer-inset)*0.4477)_calc(100%-var(--chat-composer-context-extension))/0_calc(100%-var(--chat-composer-context-extension)-var(--chat-composer-drawer-inset)*0.4477),line_to_0_var(--composer-radius),close)]",
          "not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:bottom-(--chat-composer-context-extension)",
        ],
        className,
      )}
      {...props}
    />
  );
}

const outlineClasses =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--chat-composer-outline)";

// The bottom strip continues the outline, so leave the seam between its corners open.
const contextSeamClasses =
  "group-data-with-context/composer-surface:after:[clip-path:polygon(0_0,100%_0,100%_100%,calc(100%-var(--composer-radius))_100%,calc(100%-var(--composer-radius))_calc(100%-2px),var(--composer-radius)_calc(100%-2px),var(--composer-radius)_100%,0_100%)]";

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
        "group/composer-context relative isolate mx-auto -mt-4 flex w-[calc(100%-2*var(--chat-composer-drawer-inset))] items-center gap-2 overflow-x-clip overflow-y-visible ps-1 pe-2 pt-5 pb-1",
        "before:absolute before:inset-0 before:-z-1 before:rounded-b-(--composer-radius) before:border before:border-(--chat-composer-outline) before:mask-b-from-transparent before:mask-b-from-4 before:mask-b-to-black before:mask-b-to-4 before:shadow-sm",
        "dark:before:border-(--chat-composer-outline) dark:before:bg-(--chat-composer-glass-surface) dark:before:shadow-none",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:before:bg-(--chat-composer-glass-surface)",
        "not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:bg-(--chat-composer-glass-surface)",
        className,
      )}
      {...props}
    />
  );
}

export const ComposerSurface = { Shell, Host, Main, ContextStrip };
