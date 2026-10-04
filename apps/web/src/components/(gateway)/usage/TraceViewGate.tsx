"use client";

import { createContext, useContext, type ReactNode } from "react";

const TraceViewGateContext = createContext(false);

export function TraceViewGateProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
	return <TraceViewGateContext value={enabled}>{children}</TraceViewGateContext>;
}

export function useTraceViewEnabled() {
	return useContext(TraceViewGateContext);
}
