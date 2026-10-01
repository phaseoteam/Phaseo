import type { ReactNode } from "react";
import { ChatStorageBoundary } from "@/components/(chat)/ChatStorageBoundary";

export default function ExperimentsLayout({ children }: { children: ReactNode }) {
	return <ChatStorageBoundary>{children}</ChatStorageBoundary>;
}
