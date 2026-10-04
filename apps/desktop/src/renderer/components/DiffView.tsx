import { Component, lazy, Suspense, type ReactNode } from "react";
import { CodeBlock } from "./MessageContent";
import type { DiffLayout } from "./diffRendering";

export type DiffViewProps = { patch: string; layout: DiffLayout; copyText?: string; hideHeader?: boolean };
const Renderer = lazy(() => import("./DiffRenderer").then(module => ({ default: module.DiffRenderer })));

class DiffBoundary extends Component<{ children: ReactNode; source: string; fallback: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() { return { failed: true }; }
	componentDidUpdate(previous: Readonly<{ children: ReactNode; source: string; fallback: ReactNode }>) { if (previous.source !== this.props.source && this.state.failed) this.setState({ failed: false }); }
	render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function DiffView(props: DiffViewProps) {
	const fallback = <CodeBlock text={props.copyText ?? props.patch} language="diff" />;
	return <DiffBoundary source={props.patch} fallback={fallback}><Suspense fallback={fallback}><Renderer {...props} /></Suspense></DiffBoundary>;
}
