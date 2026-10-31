import { ChatStorageBoundary } from "@/components/(chat)/ChatStorageBoundary";
import type { ReactNode } from "react";

export default function ExperimentsLayout({ children }: { children: ReactNode }) {
	return <ChatStorageBoundary>{children}</ChatStorageBoundary>;
}
