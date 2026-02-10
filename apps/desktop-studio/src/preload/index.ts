import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  ChatDoneEvent,
  ChatChunkEvent,
  CommandOutputChunk,
  CommandRun,
  CommandRunRequest,
  DesktopApi,
  GitDiffRequest,
  SendMessageInput,
  StudioMode
} from "@shared/types";

const api: DesktopApi = {
  bootstrap: () => ipcRenderer.invoke("studio:bootstrap"),
  createSession: (mode: StudioMode) => ipcRenderer.invoke("session:create", mode),
  setActiveSession: (sessionId: string) => ipcRenderer.invoke("session:set-active", sessionId),
  listMessages: (sessionId: string) => ipcRenderer.invoke("message:list", sessionId),
  sendMessage: (input: SendMessageInput) => ipcRenderer.invoke("chat:send", input),
  updateSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke("settings:update", settings),
  fetchProviderModels: (providerId: string) => ipcRenderer.invoke("provider:fetch-models", providerId),
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  listWorkspaceFiles: (workspacePath: string) => ipcRenderer.invoke("workspace:list-files", workspacePath),
  readWorkspaceFile: (workspacePath: string, relativePath: string) =>
    ipcRenderer.invoke("workspace:read-file", { workspacePath, relativePath }),
  writeWorkspaceFile: (workspacePath: string, relativePath: string, content: string) =>
    ipcRenderer.invoke("workspace:write-file", { workspacePath, relativePath, content }),
  runCommand: (request: CommandRunRequest) => ipcRenderer.invoke("command:run", request),
  stopCommand: (runId: string) => ipcRenderer.invoke("command:stop", runId),
  listGitStatus: (workspacePath: string) => ipcRenderer.invoke("git:status", workspacePath),
  getGitDiff: (request: GitDiffRequest) => ipcRenderer.invoke("git:diff", request),
  applyGitPatch: (workspacePath: string, patch: string) =>
    ipcRenderer.invoke("git:apply-patch", { workspacePath, patch }),
  onChatChunk: (listener: (event: ChatChunkEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: ChatChunkEvent) => listener(data);
    ipcRenderer.on("chat:chunk", wrapped);
    return () => ipcRenderer.removeListener("chat:chunk", wrapped);
  },
  onChatDone: (listener: (event: ChatDoneEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: ChatDoneEvent) => listener(data);
    ipcRenderer.on("chat:done", wrapped);
    return () => ipcRenderer.removeListener("chat:done", wrapped);
  },
  onCommandOutput: (listener: (event: CommandOutputChunk) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: CommandOutputChunk) => listener(data);
    ipcRenderer.on("command:output", wrapped);
    return () => ipcRenderer.removeListener("command:output", wrapped);
  },
  onCommandDone: (listener: (event: CommandRun) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: CommandRun) => listener(data);
    ipcRenderer.on("command:done", wrapped);
    return () => ipcRenderer.removeListener("command:done", wrapped);
  }
};

contextBridge.exposeInMainWorld("desktop", api);
