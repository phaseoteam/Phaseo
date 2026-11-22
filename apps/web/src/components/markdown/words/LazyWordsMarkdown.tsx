import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import type { WordsMarkdown } from "./WordsMarkdown";

// Words, its Wasm and its styles load only when the switch is on, so they add nothing for everyone else.
const Words = lazy(() => import("./WordsMarkdown").then((module) => ({ default: module.WordsMarkdown })));

/** WordsMarkdown, loaded on first use. Until it arrives, `fallback` (the current renderer) shows the same text. */
export function LazyWordsMarkdown({ fallback, ...props }: ComponentProps<typeof WordsMarkdown> & { fallback: ReactNode }) {
	return <Suspense fallback={fallback}><Words {...props} /></Suspense>;
}
