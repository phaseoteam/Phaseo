import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

/** Without this, one bad render leaves a blank window with no way back. */
class Crashed extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		return <div className="grid h-screen place-items-center bg-background p-8 text-foreground">
			<div className="max-w-lg space-y-3">
				<h1 className="text-base font-semibold">Something in this page broke</h1>
				<pre className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">{error.message}</pre>
				<button type="button" onClick={() => { window.location.hash = "#/work"; window.location.reload(); }} className="h-8 rounded-md border px-3 text-sm hover:bg-accent/60">Reload</button>
			</div>
		</div>;
	}
}

const root = document.getElementById("root");
if (!root) throw new Error("Phaseo Factory root element was not found");

createRoot(root).render(
	<StrictMode>
		<Crashed>
			<App />
		</Crashed>
	</StrictMode>,
);
