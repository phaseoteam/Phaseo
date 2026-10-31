import type { McpConnection } from "../shared/mcp";
import type { SecretVault } from "./secretVault";

type Vault = Pick<SecretVault, "available" | "get" | "set" | "remove">;
type Store = { getMcpConnections(): McpConnection[]; saveMcp(connection: McpConnection): void };
const secretId = (connectionId: string) => `mcp-headers-${connectionId}`;
const unavailable = () => new Error("Secure credential storage is unavailable on this device, so MCP header values cannot be saved. Remove the headers or try again once it is available.");
const headerNames = (connection: McpConnection | undefined) => connection?.transport === "http" ? connection.secretHeaders ?? [] : [];
const plaintext = (connection: McpConnection | undefined) => connection?.transport === "http" ? connection.headers ?? {} : {};

/**
 * MCP HTTP header values (bearer tokens and the like) in the credential vault, one entry per connection. Settings keep
 * only the names (`secretHeaders`); main reads the values right before connecting.
 */
export class McpHeaderSecrets {
	constructor(private readonly vault?: Vault) {}
	private async read(connectionId: string): Promise<Record<string, string>> {
		if (!this.vault || !await this.vault.available()) throw unavailable();
		try { return JSON.parse(await this.vault.get(secretId(connectionId))) as Record<string, string>; }
		catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
	}

	/**
	 * Moves the values a save brings into the vault and returns the connection to store, with names only. A listed name
	 * without a new value keeps the saved one. Refuses rather than store a value in plaintext.
	 */
	async save(connection: McpConnection, values: Record<string, string> = {}, previous?: McpConnection): Promise<McpConnection> {
		const names = headerNames(connection), before = headerNames(previous), legacy = plaintext(previous);
		const { headers: _headers, secretHeaders: _names, ...rest } = connection as McpConnection & { headers?: unknown; secretHeaders?: unknown };
		const stored = (connection.transport === "http" && names.length ? { ...rest, secretHeaders: [...names] } : rest) as McpConnection;
		for (const name of names) if (values[name] === undefined && !before.includes(name) && legacy[name] === undefined) throw new Error(`Enter a value for the ${name} header.`);
		const unchanged = !Object.keys(values).length && !Object.keys(legacy).length && names.length === before.length && names.every(name => before.includes(name));
		if (unchanged) return stored;
		if (!names.length) { this.vault?.remove(secretId(connection.id)); return stored; }
		if (!this.vault || !await this.vault.available()) throw unavailable();
		const current = before.length ? await this.read(connection.id) : {};
		await this.vault.set(secretId(connection.id), JSON.stringify(Object.fromEntries(names.map(name => [name, values[name] ?? current[name] ?? legacy[name]]))));
		return stored;
	}

	/** The connections with their header values, for connecting; those `wanted` rejects are returned as they are. */
	resolve(connections: McpConnection[], wanted: (connection: McpConnection) => boolean = () => true): Promise<McpConnection[]> {
		return Promise.all(connections.map(async connection => {
			const names = headerNames(connection);
			if (connection.transport !== "http" || !names.length || !wanted(connection)) return connection;
			const lost = new Error(`The saved headers for MCP server “${connection.name}” could not be read. Enter them again in Settings → MCP servers.`);
			const values = await this.read(connection.id).catch(error => { throw error instanceof Error && error.message === unavailable().message ? error : lost; });
			if (names.some(name => typeof values[name] !== "string")) throw lost;
			return { ...connection, headers: { ...connection.headers, ...Object.fromEntries(names.map(name => [name, values[name]])) } };
		}));
	}

	/** Moves header values saved in plaintext by earlier builds into the vault. Without a vault they stay put, and are still never sent to a window. */
	async migrate(store: Store) {
		for (const connection of store.getMcpConnections()) {
			const legacy = plaintext(connection);
			if (!Object.keys(legacy).length) continue;
			if (!this.vault || !await this.vault.available()) return;
			const names = [...new Set([...headerNames(connection), ...Object.keys(legacy)])];
			store.saveMcp(await this.save({ ...connection, secretHeaders: names } as McpConnection, {}, connection));
		}
	}
}
