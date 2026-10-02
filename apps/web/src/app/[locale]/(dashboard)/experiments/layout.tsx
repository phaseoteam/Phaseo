import { ChatStorageBoundary } from "@/components/(chat)/ChatStorageBoundary";
import { ScopedMessages, type ScopedLayoutProps } from "@/components/i18n/ScopedMessages";

export default function ExperimentsLayout({ children, params }: ScopedLayoutProps) {
	return <ScopedMessages params={params} namespaces={["Common.ui.auditCopy.loadingChat", "Common.ui.auditCopy.chatHistoryFailed"]}><ChatStorageBoundary>{children}</ChatStorageBoundary></ScopedMessages>;
}
