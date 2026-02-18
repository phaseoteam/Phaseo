import { contextBridge, ipcRenderer } from "electron";
const api = {
  bootstrap: () => ipcRenderer.invoke("studio:bootstrap"),
  createSession: (mode) => ipcRenderer.invoke("session:create", mode),
  setActiveSession: (sessionId) => ipcRenderer.invoke("session:set-active", sessionId),
  listMessages: (sessionId) => ipcRenderer.invoke("message:list", sessionId),
  sendMessage: (input) => ipcRenderer.invoke("chat:send", input),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  fetchProviderModels: (providerId) => ipcRenderer.invoke("provider:fetch-models", providerId),
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  listWorkspaceFiles: (workspacePath) => ipcRenderer.invoke("workspace:list-files", workspacePath),
  readWorkspaceFile: (workspacePath, relativePath) => ipcRenderer.invoke("workspace:read-file", { workspacePath, relativePath }),
  writeWorkspaceFile: (workspacePath, relativePath, content) => ipcRenderer.invoke("workspace:write-file", { workspacePath, relativePath, content }),
  runCommand: (request) => ipcRenderer.invoke("command:run", request),
  stopCommand: (runId) => ipcRenderer.invoke("command:stop", runId),
  listGitStatus: (workspacePath) => ipcRenderer.invoke("git:status", workspacePath),
  getGitDiff: (request) => ipcRenderer.invoke("git:diff", request),
  applyGitPatch: (workspacePath, patch) => ipcRenderer.invoke("git:apply-patch", { workspacePath, patch }),
  onChatChunk: (listener) => {
    const wrapped = (_event, data) => listener(data);
    ipcRenderer.on("chat:chunk", wrapped);
    return () => ipcRenderer.removeListener("chat:chunk", wrapped);
  },
  onChatDone: (listener) => {
    const wrapped = (_event, data) => listener(data);
    ipcRenderer.on("chat:done", wrapped);
    return () => ipcRenderer.removeListener("chat:done", wrapped);
  },
  onCommandOutput: (listener) => {
    const wrapped = (_event, data) => listener(data);
    ipcRenderer.on("command:output", wrapped);
    return () => ipcRenderer.removeListener("command:output", wrapped);
  },
  onCommandDone: (listener) => {
    const wrapped = (_event, data) => listener(data);
    ipcRenderer.on("command:done", wrapped);
    return () => ipcRenderer.removeListener("command:done", wrapped);
  }
};
contextBridge.exposeInMainWorld("desktop", api);
