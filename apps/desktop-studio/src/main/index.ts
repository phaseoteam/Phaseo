import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  AppSettings,
  CommandRunRequest,
  GitDiffRequest,
  SendMessageInput,
  StudioMode,
  WorkspaceFile
} from "@shared/types";
import { generateAssistantReply } from "./chat";
import { CommandRunner } from "./commands";
import { applyGitPatch, getGitDiff, listGitStatus } from "./git";
import { fetchProviderModels } from "./providers";
import { StudioStore } from "./store";
import {
  listWorkspaceFiles,
  pickWorkspaceFolder,
  readWorkspaceFile,
  writeWorkspaceFile
} from "./workspace";

let mainWindow: BrowserWindow | null = null;
let store: StudioStore;

const commandRunner = new CommandRunner();
const appDataPath = join(app.getPath("appData"), "AI Stats Desktop Studio");
const sessionDataPath = join(appDataPath, "session-data");

mkdirSync(sessionDataPath, { recursive: true });
app.setPath("userData", appDataPath);
app.setPath("sessionData", sessionDataPath);
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disk-cache-dir", join(sessionDataPath, "cache"));

function chunkText(text: string, chunkSize = 48): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks.length > 0 ? chunks : [""];
}

function emit(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveProviderAndModel(settings: AppSettings, mode: StudioMode) {
  const selection = mode === "code" ? settings.codeSelection : settings.chatSelection;
  const provider = settings.providers.find((item) => item.id === selection.providerId) ?? settings.providers[0];

  if (!provider) {
    throw new Error("No providers configured. Add a provider in the sidebar settings.");
  }

  const model = provider.models.includes(selection.model)
    ? selection.model
    : provider.defaultModel || provider.models[0] || "";

  if (!model) {
    throw new Error(`Provider \"${provider.name}\" has no configured models.`);
  }

  return {
    provider,
    model
  };
}

async function createMainWindow(): Promise<void> {
  const preloadMjs = join(__dirname, "../preload/index.mjs");
  const preloadPath = existsSync(preloadMjs) ? preloadMjs : join(__dirname, "../preload/index.js");

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0c1119",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  const loadRenderer = async () => {
    if (devServerUrl) {
      await mainWindow?.loadURL(devServerUrl);
      return;
    }

    await mainWindow?.loadFile(join(__dirname, "../renderer/index.html"));
  };

  mainWindow.webContents.on("did-finish-load", () => {
    console.info("[desktop-studio] renderer loaded");
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[desktop-studio] renderer failed to load (${errorCode}) ${errorDescription}: ${validatedURL}`
    );
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[desktop-studio] renderer process gone", details);
  });

  if (process.platform === "win32" || process.platform === "linux") {
    Menu.setApplicationMenu(null);
    mainWindow.removeMenu();
    mainWindow.setMenuBarVisibility(false);
  }

  await loadRenderer();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("studio:bootstrap", () => store.bootstrap());

  ipcMain.handle("session:create", (_event, mode: "chat" | "code") => store.createSession(mode));

  ipcMain.handle("session:set-active", (_event, sessionId: string) => {
    store.setActiveSession(sessionId);
  });

  ipcMain.handle("message:list", (_event, sessionId: string) => store.listMessages(sessionId));

  ipcMain.handle("chat:send", async (_event, input: SendMessageInput) => {
    const userMessage = store.addMessage(input.sessionId, "user", input.content);

    const { provider, model } = resolveProviderAndModel(store.getSettings(), input.mode);
    const assistantMessage = store.addMessage(input.sessionId, "assistant", "", model, "streaming");

    void (async () => {
      try {
        const conversation = store
          .listMessages(input.sessionId)
          .filter((message) => message.id !== assistantMessage.id);

        const response = await generateAssistantReply(provider, model, conversation);
        for (const chunk of chunkText(response.content)) {
          store.appendToMessage(assistantMessage.id, chunk);
          emit("chat:chunk", {
            sessionId: input.sessionId,
            messageId: assistantMessage.id,
            chunk
          });
          await sleep(12);
        }

        store.setMessageStatus(assistantMessage.id, "done");
        emit("chat:done", {
          sessionId: input.sessionId,
          messageId: assistantMessage.id,
          status: "done"
        });
      } catch (error) {
        const details = error instanceof Error ? error.message : "Unknown provider error.";
        store.appendToMessage(assistantMessage.id, `\n${details}`);
        store.setMessageStatus(assistantMessage.id, "error");
        emit("chat:done", {
          sessionId: input.sessionId,
          messageId: assistantMessage.id,
          status: "error",
          error: details
        });
      }
    })();

    return {
      userMessage,
      assistantMessage
    };
  });

  ipcMain.handle("settings:update", (_event, settings: Partial<AppSettings>) => store.updateSettings(settings));
  ipcMain.handle("provider:fetch-models", async (_event, providerId: string) => {
    const provider = store.getSettings().providers.find((item) => item.id === providerId);
    if (!provider) {
      throw new Error("Provider not found.");
    }

    return fetchProviderModels(provider);
  });

  ipcMain.handle("workspace:pick", async () => {
    const path = await pickWorkspaceFolder();
    if (path) {
      store.setWorkspace(path);
    }
    return path;
  });

  ipcMain.handle("workspace:list-files", (_event, workspacePath: string): WorkspaceFile[] =>
    listWorkspaceFiles(workspacePath)
  );

  ipcMain.handle(
    "workspace:read-file",
    (_event, payload: { workspacePath: string; relativePath: string }) =>
      readWorkspaceFile(payload.workspacePath, payload.relativePath)
  );

  ipcMain.handle(
    "workspace:write-file",
    (_event, payload: { workspacePath: string; relativePath: string; content: string }) => {
      writeWorkspaceFile(payload.workspacePath, payload.relativePath, payload.content);
    }
  );

  ipcMain.handle("command:run", (_event, request: CommandRunRequest) => {
    return commandRunner.run(
      request,
      (chunk) => emit("command:output", chunk),
      (run) => emit("command:done", run)
    );
  });

  ipcMain.handle("command:stop", (_event, runId: string) => {
    commandRunner.stop(runId);
  });

  ipcMain.handle("git:status", (_event, workspacePath: string) => listGitStatus(workspacePath));

  ipcMain.handle("git:diff", (_event, request: GitDiffRequest) =>
    getGitDiff(request.workspacePath, request.relativePath)
  );

  ipcMain.handle("git:apply-patch", (_event, payload: { workspacePath: string; patch: string }) =>
    applyGitPatch(payload.workspacePath, payload.patch)
  );
}

app.whenReady().then(async () => {
  store = new StudioStore(app.getPath("userData"));
  registerIpcHandlers();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
