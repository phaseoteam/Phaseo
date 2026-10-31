// Lazy-loaded components on React.lazy. `ssr: false` renders the loading state on the
// server and loads the component after hydration.
import { lazy, Suspense, useEffect, useState, type ComponentType, type JSX, type ReactNode } from "react";

type Loaded<P> = ComponentType<P> | { default: ComponentType<P> };
type Loader<P> = () => Promise<Loaded<P>>;
type Options = { ssr?: boolean; loading?: (props: { isLoading?: boolean; error?: Error | null }) => ReactNode };

export default function dynamic<P extends object = Record<string, unknown>>(loader: Loader<P>, options: Options = {}): ComponentType<P> {
	const Lazy = lazy(async () => {
		const mod = await loader();
		return { default: ("default" in (mod as object) ? (mod as { default: ComponentType<P> }).default : mod) as ComponentType<P> };
	});
	// Render `loading` as a component (it may use hooks), never at module load.
	const Loading = options.loading as ComponentType<{ isLoading?: boolean; error?: Error | null }> | undefined;

	function DynamicComponent(props: P) {
		const fallback = Loading ? <Loading isLoading error={null} /> : null;
		const [mounted, setMounted] = useState(options.ssr !== false);
		useEffect(() => {
			if (!mounted) setMounted(true);
		}, [mounted]);
		if (!mounted) return <>{fallback}</>;
		return (
			<Suspense fallback={fallback}>
				<Lazy {...(props as P & JSX.IntrinsicAttributes)} />
			</Suspense>
		);
	}
	DynamicComponent.displayName = "Dynamic";
	return DynamicComponent;
}
