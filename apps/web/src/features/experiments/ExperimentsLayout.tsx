import { Outlet } from "@tanstack/react-router";
import { ChatStorageBoundary } from "@/components/(chat)/ChatStorageBoundary";

export default function ExperimentsLayout() {
	return <ChatStorageBoundary><Outlet /></ChatStorageBoundary>;
}
