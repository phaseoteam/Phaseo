import type { Task, Workspace } from "./workspace";
import { inboxReasonFromCounts, type TaskAttention } from "./inbox";

export type TaskOverview = Pick<Task, "id" | "title" | "harness" | "model" | "mode" | "status" | "pinned" | "tags" | "settledOverride" | "settledAt" | "unsettledAt" | "snoozedUntil" | "snoozedAt" | "lastSnoozeWakeAt" | "lastVisitedAt" | "autoSettle" | "orderKey" | "archived" | "createdAt" | "updatedAt" | "revision" | "projectId" | "accountId" | "agentId" | "parentId" | "delegation" | "launch" | "missionId" | "inboxReadAt" | "pullRequests" | "usageTotals"> & TaskAttention & { attentionReason?: string; attentionKey: string; queueCount?: number; lastCompletedAt?: string; lastUserMessageAt?: string };
export type WorkspaceOverview = Omit<Workspace, "tasks"> & { tasks: TaskOverview[] };
export function emptyOverview(): WorkspaceOverview { return { version: 1, projects: [], accounts: [], agents: [], mcpConnections: [], tasks: [] }; }

/** What the overview reads from a chat's messages; the store passes it from columns instead of loading the conversation. */
export type ConversationSummary = { lastUserId?: string; lastUserAt?: string; lastCompletedAt?: string };

/** A chat's sidebar and inbox summary: everything the overview needs without its messages and activities. */
export function taskOverview(task: Task, conversation?: ConversationSummary): TaskOverview {
	const summary = conversation ?? { lastUserId: task.messages?.findLast(value => value.role === "user")?.id, lastUserAt: task.messages?.findLast(value => value.role === "user" && !value.delivery)?.createdAt, lastCompletedAt: task.messages?.findLast(value => value.role === "user" && value.completedAt)?.completedAt };
	const metadata: TaskOverview = {
		id: task.id, title: task.title, harness: task.harness, model: task.model, mode: task.mode, status: task.status,
		pinned: Boolean(task.pinned), tags: task.tags, settledOverride: task.settledOverride, settledAt: task.settledAt, unsettledAt: task.unsettledAt, snoozedUntil: task.snoozedUntil, snoozedAt: task.snoozedAt, lastSnoozeWakeAt: task.lastSnoozeWakeAt, lastVisitedAt: task.lastVisitedAt, ...(task.autoSettle !== undefined && task.autoSettle !== null ? { autoSettle: Boolean(task.autoSettle) } : {}), orderKey: task.orderKey,
		queueCount: task.queue?.length ?? 0, lastCompletedAt: summary.lastCompletedAt, lastUserMessageAt: summary.lastUserAt,
		archived: Boolean(task.archived), createdAt: task.createdAt, updatedAt: task.updatedAt, revision: task.revision,
		projectId: task.projectId, accountId: task.accountId, agentId: task.agentId, parentId: task.parentId, delegation: task.delegation, launch: task.launch, missionId: task.missionId, inboxReadAt: task.inboxReadAt, pullRequests: task.pullRequests, usageTotals: task.usageTotals,
		approvalsCount: task.approvals?.length ?? 0, answersCount: (task.questions?.length ?? 0) + (task.forms?.length ?? 0),
		steeringReviewCount: task.steering?.filter(value => value.status === "unconfirmed" || value.status === "rejected").length ?? 0,
		attentionKey: JSON.stringify([summary.lastUserId ?? null, task.approvals?.map(value => value.id) ?? [], task.questions?.map(value => value.id) ?? [], task.forms?.map(value => value.id) ?? [], task.steering?.map(value => [value.id, value.status]) ?? []]),
	};
	metadata.attentionReason = inboxReasonFromCounts(metadata);
	// Stored chats can hold explicit nulls; the overview leaves those fields out.
	return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined)) as TaskOverview;
}

/** Newest first, then by id, as the sidebar lists chats. */
export const overviewOrder = (a: TaskOverview, b: TaskOverview) => b.updatedAt.localeCompare(a.updatedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function workspaceOverview(workspace: Workspace): WorkspaceOverview {
	return { version: workspace.version, projects: workspace.projects, accounts: workspace.accounts, agents: workspace.agents, mcpConnections: workspace.mcpConnections, tasks: workspace.tasks.map(task => taskOverview(task)).sort(overviewOrder) };
}
