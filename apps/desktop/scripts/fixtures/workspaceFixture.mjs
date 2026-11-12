import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The app's own store, built beside the main bundle, so fixtures write chats exactly as the app does.
const storeModule = pathToFileURL(path.resolve(import.meta.dirname, "../../dist/main/workspaceStore.mjs")).href;

/** A second connection to a workspace through the app's store, for fixtures that change chats while the app runs. */
export async function openFixtureStore(filename) {
	const { WorkspaceStore } = await import(storeModule);
	return new WorkspaceStore(filename);
}

/**
 * Fixtures seed chats as whole rows in a plain `tasks (id, data)` table. This saves each through the store, which
 * keeps messages and activities as rows of their own, and leaves the other seeded tables as they are.
 */
export async function storeFixtureTasks(filename) {
	const raw = new DatabaseSync(filename);
	const tasks = raw.prepare("SELECT data FROM tasks").all().map(row => JSON.parse(row.data));
	raw.exec("DROP TABLE tasks"); raw.close();
	const store = await openFixtureStore(filename);
	try { for (const task of tasks) store.saveTask(task, true); } finally { store.close(); }
}
