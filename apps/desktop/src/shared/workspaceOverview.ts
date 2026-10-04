import type { Task, Workspace } from "./workspace";
import { inboxReasonFromCounts, type TaskAttention } from "./inbox";

export type TaskOverview = Pick<Task, "id" | "title" | "harness" | "model" | "mode" | "status" | "pinned" | "archived" | "createdAt" | "updatedAt" | "revision" | "projectId" | "accountId" | "agentId" | "parentId" | "missionId" | "inboxReadAt"> & TaskAttention & { attentionReason?: string };
export type WorkspaceOverview = Omit<Workspace, "tasks"> & { tasks: TaskOverview[] };
export function emptyOverview(): WorkspaceOverview { return { version: 1, projects: [], accounts: [], agents: [], mcpConnections: [], tasks: [] }; }

export function workspaceOverview(workspace: Workspace): WorkspaceOverview {
	return { version: workspace.version, projects: workspace.projects, accounts: workspace.accounts, agents: workspace.agents, mcpConnections: workspace.mcpConnections, tasks: workspace.tasks.map(task => {
		const metadata: TaskOverview = {
			id: task.id, title: task.title, harness: task.harness, model: task.model, mode: task.mode, status: task.status,
			pinned: task.pinned, archived: task.archived, createdAt: task.createdAt, updatedAt: task.updatedAt, revision: task.revision,
			projectId: task.projectId, accountId: task.accountId, agentId: task.agentId, parentId: task.parentId, missionId: task.missionId, inboxReadAt: task.inboxReadAt,
			approvalsCount: task.approvals?.length ?? 0, answersCount: (task.questions?.length ?? 0) + (task.forms?.length ?? 0),
			steeringReviewCount: task.steering?.filter(value => value.status === "unconfirmed" || value.status === "rejected").length ?? 0,
		};
		metadata.attentionReason = inboxReasonFromCounts(metadata);
		return metadata;
	}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)) };
}
