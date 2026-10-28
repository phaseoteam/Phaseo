# @phaseo/ui

React DOM components shared by Phaseo's website (`apps/web`), desktop app (`apps/desktop`) and Phaseo Factory (`apps/factory`). They're built on [Base UI](https://base-ui.com) and styled with Tailwind.

Import each component from its own path:

```tsx
import { Button } from "@phaseo/ui/button"
import { cn } from "@phaseo/ui/cn"
```

Each app keeps its own `components/ui/*.tsx` files as one-line re-exports, so code inside the apps imports from the same paths as before.

| Import | What it is |
|---|---|
| `@phaseo/ui/cn` | `cn()`: joins class names, and later Tailwind classes override earlier ones |
| `@phaseo/ui/base-ui-compat` | `renderAsChild`, which turns an `asChild` prop into Base UI's `render` prop |
| `@phaseo/ui/badge` | `Badge`, `badgeVariants` |
| `@phaseo/ui/button` | `Button`, `buttonVariants` |
| `@phaseo/ui/dropdown-menu` | `DropdownMenu` and its parts |
| `@phaseo/ui/input` | `Input` |
| `@phaseo/ui/kbd` | `Kbd`, `KbdGroup` |
| `@phaseo/ui/popover` | `Popover` and its parts |
| `@phaseo/ui/scroll-area` | `ScrollArea`, `ScrollBar` |
| `@phaseo/ui/separator` | `Separator` |
| `@phaseo/ui/tabs` | `Tabs` and its parts |
| `@phaseo/ui/tooltip` | `Tooltip` and its parts, plus `Tip` for a one-line tooltip |

## Rules

- **No framework imports.** Nothing from `next/*`, `next-intl`, `next-themes` or Electron. The same file has to work in Next.js and in Vite.
- **Text comes in as props.** Components don't translate. If one needs a label such as "Close", it takes a prop with an English default, and the website passes its translation from a thin wrapper in `apps/web/src/components/ui`.
- **No app imports.** Import other files in this package with relative paths (`./button`), never `@/…` or a path into `apps/`.
- **Keep `"use client"`** at the top of every file that uses hooks, context or event handlers, so Next.js treats it as a Client Component. Vite ignores it.
- **Corners are `rounded-md`** (8px) for chips, buttons, inputs and tiles: no pill shapes, and no `rounded-full`, `rounded-lg` or `rounded-xl` on them. Smaller pieces inside them may go smaller. Two deliberate exceptions: the switch track, and the callout style used for alerts.
- **Source, not a build.** The package exports `.tsx` files, and each app compiles them with its own bundler.

## Using it in an app

1. Add `"@phaseo/ui": "workspace:*"` to the app's dependencies. The app also needs the peer dependencies: `react`, `react-dom`, `@base-ui/react`, `class-variance-authority` and `lucide-react`.
2. Point Tailwind at the package source from the app's main CSS file, or the classes used only here are left out of the build:

   ```css
   @source "<relative path to>/packages/shared/ui/src";
   ```

3. Next.js only: add `@phaseo/ui` to `transpilePackages` in `next.config.mjs`.

## Checks

```sh
pnpm --filter @phaseo/ui typecheck
```
