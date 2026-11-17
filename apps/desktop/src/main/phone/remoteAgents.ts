import { parseRemoteAgentRequest, phoneLimits, remoteAgentToolMs, type RemoteAgentHello, type RemoteAgentRequest } from "@phaseo/phone-protocol";
import type { ThreadTools } from "../../shared/orchestration";
import type { OutsideAgentAccess } from "../../shared/outsideAgents";
import { outsideAgentToolset } from "../outsideAgentsMcp";
import type { AgentDeviceRecord } from "./phoneDevices";

export type RemoteAgentPorts = {
	/** The thread tools for an outside agent, as the local MCP server gets them (WorkspaceRuntime.outsideThreadTools). */
	tools: (agent: { id: string; name: string; access: OutsideAgentAccess }) => Partial<ThreadTools>;
	desktopName: () => string;
	/** Removes the link, as Remove in Settings → Outside agents does. */
	remove: (agentId: string) => void;
};

/** Room for the envelope around an answer, under the 1 MiB a frame may be. */
const answerBytes = phoneLimits.frameBytes - 16 * 1024;

/**
 * Answers an AI app linked over Phaseo Connect through mcp.phaseo.app. It gets the tools an outside agent on
 * this computer gets with a token of the same access, run the same way: chats it starts run supervised, so the person
 * approves their actions here. Nothing else a phone can do is reachable from it.
 */
export function remoteAgentRequests(ports: RemoteAgentPorts) {
	return async (agent: AgentDeviceRecord, text: string): Promise<Record<string, unknown> | undefined> => {
		let request: RemoteAgentRequest;
		try { request = parseRemoteAgentRequest(text); }
		catch (error) {
			const id = (() => { try { const value = JSON.parse(text) as { id?: unknown }; return typeof value.id === "string" ? value.id.slice(0, 64) : undefined; } catch { return undefined; } })();
			return id ? { id, type: "agent_tool", ok: false, error: { message: error instanceof Error ? error.message : "Invalid request." } } : undefined;
		}
		const answer = (result: unknown) => {
			const reply = { id: request.id, type: request.type, ok: true, result };
			return JSON.stringify(reply).length > answerBytes ? refuse("The answer is too large to send. Ask for less, for example a narrower search.") : reply;
		};
		const refuse = (message: string) => ({ id: request.id, type: request.type, ok: false, error: { message } });
		const tools = outsideAgentToolset(ports.tools({ id: agent.id, name: agent.name, access: agent.access }), agent.access);
		if (request.type === "agent_hello") return answer({ desktopName: ports.desktopName(), access: agent.access, tools: tools.map(tool => tool.name) } satisfies RemoteAgentHello);
		if (request.type === "agent_unlink") {
			// After the answer has gone: removing the link ends the app's relay sign-in.
			setTimeout(() => { try { ports.remove(agent.id); } catch { /* already removed */ } }, 0);
			return answer({ unlinked: true });
		}
		const tool = tools.find(value => value.name === request.name);
		if (!tool) return refuse(`Unknown tool. This link can use: ${tools.map(value => value.name).join(", ")}.`);
		try { return answer(await tool.execute(request.arguments, AbortSignal.timeout(Math.max(remoteAgentToolMs(request.name, request.arguments), 10 * 60_000)))); }
		catch (error) { return refuse(error instanceof Error ? error.message : "The tool failed."); }
	};
}
