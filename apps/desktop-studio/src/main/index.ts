import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type {
  AppSettings,
  CommandRunRequest,
  SendMessageInput,
  WorkspaceFile
} from "@shared/types";
import { generateAssistantReply } from "./chat";
import { CommandRunner } from "./commands";
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

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0c1119",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

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
    const assistantMessage = store.addMessage(
      input.sessionId,
      "assistant",
      "",
      store.getSettings().openAiModel,
      "streaming"
    );

    void (async () => {
      try {
        const settings = store.getSettings();
        const conversation = store
          .listMessages(input.sessionId)
          .filter((message) => message.id !== assistantMessage.id);

        const response = await generateAssistantReply(settings, conversation);
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
