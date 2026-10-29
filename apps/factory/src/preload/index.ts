import { contextBridge, ipcRenderer } from "electron";
import type { FactoryApi, FactorySnapshot, WindowUpdate, WorkItem } from "../shared/types";

/** The last list the main process sent; updates that leave items out carry on using it. */
let items: WorkItem[] | null = null;
const keep = (snapshot: FactorySnapshot) => {
	items = snapshot.items;
	return snapshot;
};

const api: FactoryApi = {
	snapshot: () => ipcRenderer.invoke("factory:snapshot").then(keep),
	refresh: () => ipcRenderer.invoke("factory:refresh").then(keep),
	updateSettings: (patch) => ipcRenderer.invoke("factory:update-settings", patch).then(keep),
	itemBody: (itemId) => ipcRenderer.invoke("factory:item-body", itemId),
	similarItems: (itemId) => ipcRenderer.invoke("factory:similar-items", itemId),
	itemComments: (itemId) => ipcRenderer.invoke("factory:item-comments", itemId),
	chatSend: (itemId, text) => ipcRenderer.invoke("factory:chat-send", itemId, text),
	chatStop: (itemId) => ipcRenderer.invoke("factory:chat-stop", itemId),
	chatAgent: (itemId, agentId) => ipcRenderer.invoke("factory:chat-agent", itemId, agentId),
	chatClear: (itemId) => ipcRenderer.invoke("factory:chat-clear", itemId),
	addNote: (repo, text) => ipcRenderer.invoke("factory:add-note", repo, text),
	removeNote: (repo, noteId) => ipcRenderer.invoke("factory:remove-note", repo, noteId),
	updateNote: (repo, noteId, patch) => ipcRenderer.invoke("factory:update-note", repo, noteId, patch),
	startRun: (input) => ipcRenderer.invoke("factory:start-run", input),
	cancelRun: (runId) => ipcRenderer.invoke("factory:cancel-run", runId),
	assign: (itemId, agentId) => ipcRenderer.invoke("factory:assign", itemId, agentId),
	sendMessage: (itemId, text) => ipcRenderer.invoke("factory:send-message", itemId, text),
	createIssue: (input) => ipcRenderer.invoke("factory:create-issue", input),
	addRepo: (repo, checkout) => ipcRenderer.invoke("factory:add-repo", repo, checkout),
	removeRepo: (repo) => ipcRenderer.invoke("factory:remove-repo", repo),
	orderRepos: (order) => ipcRenderer.invoke("factory:order-repos", order),
	changeOnGithub: (itemId, change) => ipcRenderer.invoke("factory:change-on-github", itemId, change),
	mergeState: (itemId) => ipcRenderer.invoke("factory:merge-state", itemId),
	itemTimeline: (itemId) => ipcRenderer.invoke("factory:item-timeline", itemId),
	repoLabels: (itemId) => ipcRenderer.invoke("factory:repo-labels", itemId),
	assignable: (itemId, query) => ipcRenderer.invoke("factory:assignable", itemId, query),
	itemChecks: (itemId) => ipcRenderer.invoke("factory:item-checks", itemId),
	checkForUpdate: () => ipcRenderer.invoke("factory:check-update"),
	pullFiles: (itemId) => ipcRenderer.invoke("factory:pull-files", itemId),
	checkLog: (itemId, link) => ipcRenderer.invoke("factory:check-log", itemId, link),
	mentions: (itemId, query) => ipcRenderer.invoke("factory:mentions", itemId, query),
	importRepo: (repo) => ipcRenderer.invoke("factory:import-repo", repo),
	pickCheckout: () => ipcRenderer.invoke("factory:pick-checkout"),
	localClones: () => ipcRenderer.invoke("factory:local-clones"),
	act: (itemId, action) => ipcRenderer.invoke("factory:act", itemId, action),
	openExternal: (url) => ipcRenderer.invoke("factory:open-external", url),
	windowAction: (action) => ipcRenderer.invoke("factory:window", action),
	onChange: (listener) => {
		const handler = (_event: unknown, update: WindowUpdate) => {
			if (update.items) items = update.items;
			// Before the first full snapshot arrives there's no list to fill in from; that snapshot follows.
			if (items) listener({ ...update, items });
		};
		ipcRenderer.on("factory:changed", handler);
		return () => ipcRenderer.removeListener("factory:changed", handler);
	},
	platform: process.platform,
};

contextBridge.exposeInMainWorld("factory", api);
