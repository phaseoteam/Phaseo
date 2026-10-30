// `next/script`: `beforeInteractive` renders a script tag; everything else is
// injected once after hydration.
import { useEffect, type ScriptHTMLAttributes } from "react";

type Strategy = "beforeInteractive" | "afterInteractive" | "lazyOnload" | "worker";
export type ScriptProps = ScriptHTMLAttributes<HTMLScriptElement> & {
	id?: string;
	strategy?: Strategy;
	onLoad?: () => void;
	onReady?: () => void;
	onError?: (error: unknown) => void;
};

const injected = new Set<string>();

export default function Script({ strategy = "afterInteractive", id, src, children, dangerouslySetInnerHTML, onLoad, onReady, onError, ...rest }: ScriptProps) {
	useEffect(() => {
		if (strategy === "beforeInteractive") return;
		const key = id ?? src ?? (typeof children === "string" ? children : dangerouslySetInnerHTML?.__html ?? "");
		if (!key || injected.has(String(key))) {
			onReady?.();
			return;
		}
		const run = () => {
			injected.add(String(key));
			const el = document.createElement("script");
			if (id) el.id = id;
			for (const [name, value] of Object.entries(rest)) if (typeof value === "string" || typeof value === "boolean") el.setAttribute(name === "className" ? "class" : name, String(value));
			if (src) el.src = src;
			else el.text = typeof children === "string" ? children : (dangerouslySetInnerHTML?.__html as string) ?? "";
			el.onload = () => {
				onLoad?.();
				onReady?.();
			};
			el.onerror = (event) => onError?.(event);
			document.body.appendChild(el);
			if (!src) onReady?.();
		};
		if (strategy === "lazyOnload" && "requestIdleCallback" in window) (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run);
		else run();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- inject once per mount, like next/script.
	}, []);
	if (strategy !== "beforeInteractive") return null;
	return <script id={id} src={src} dangerouslySetInnerHTML={dangerouslySetInnerHTML ?? (typeof children === "string" ? { __html: children } : undefined)} {...rest} />;
}
